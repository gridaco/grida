import { NextRequest, NextResponse } from "next/server";
import { service_role } from "@/lib/supabase/server";

/**
 * POST /api/ciam/auth/challenge/[challenge_id]/verify
 *
 * Verifies OTP for a challenge and mints a portal session URL token.
 *
 * Body: { otp: string }
 * Returns: { session_url: string, token: string, activate_expires_at: string, activation_ttl_seconds: number, idle_ttl_seconds: number }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ challenge_id: string }> }
) {
  try {
    const { challenge_id } = await params;
    const body = await req.json();
    const { otp } = body;

    if (!challenge_id || !otp) {
      return NextResponse.json(
        { error: "challenge_id and otp are required" },
        { status: 400 }
      );
    }

    const { data: session_data, error: verify_error } =
      await service_role.ciam.rpc("verify_customer_otp_and_create_session", {
        p_challenge_id: challenge_id,
        p_otp: otp,
        p_session_ttl_seconds: 2592000,
      });

    if (verify_error || !session_data || session_data.length === 0) {
      console.error("[ciam]/error verifying OTP", verify_error);
      return NextResponse.json(
        { error: "Invalid or expired OTP" },
        { status: 401 }
      );
    }

    const { customer_uid, project_id } = session_data[0];
    if (!customer_uid || !project_id) {
      return NextResponse.json(
        { error: "Invalid or expired OTP" },
        { status: 401 }
      );
    }

    const activation_ttl_seconds = 60 * 5;
    const idle_ttl_seconds = 60 * 60;

    const { data: portal_session, error: portal_session_err } =
      await service_role.ciam.rpc("create_customer_portal_session", {
        p_project_id: project_id,
        p_customer_uid: customer_uid,
        p_activation_ttl_seconds: activation_ttl_seconds,
        p_idle_ttl_seconds: idle_ttl_seconds,
        p_scopes: ["portal"],
      });

    if (portal_session_err || !portal_session || portal_session.length === 0) {
      console.error("[ciam]/error creating portal session", portal_session_err);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    const s = portal_session[0];
    const token = s.token as string;

    return NextResponse.json({
      session_url: `/p/session/${encodeURIComponent(token)}`,
      token,
      activate_expires_at: s.activate_expires_at,
      activation_ttl_seconds: s.activation_ttl_seconds,
      idle_ttl_seconds: s.idle_ttl_seconds,
    });
  } catch (error) {
    console.error("[ciam]/unexpected error in OTP verification", error);
    return NextResponse.json(
      {
        error:
          process.env.VERCEL === "1"
            ? "Internal server error"
            : ((error as any)?.message ?? "Internal server error"),
      },
      { status: 500 }
    );
  }
}

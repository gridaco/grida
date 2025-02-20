import { GridaXSupabase } from "@/types";
import { GridFilter } from "@/scaffolds/grid-filter";
import type { XSBUserRow } from "@/scaffolds/grid";

export namespace XSBAuthUsersGridData {
  type UserFilterInput = {
    search?: string;
  };

  export function rows(
    users: GridaXSupabase.SupabaseUser[],
    filter: UserFilterInput
  ): XSBUserRow[] {
    const transformed = transformUsers(users);
    return GridFilter.filter(
      transformed,
      { empty_data_hidden: false, search: filter.search },
      undefined,
      [
        "id",
        "email",
        "phone",
        "display_name",
        "providers",
        "created_at",
        "last_sign_in_at",
      ]
    );
  }

  function transformUsers(users: GridaXSupabase.SupabaseUser[]): XSBUserRow[] {
    return users.map((user) => {
      return {
        id: user.id,
        avatar_url: user.user_metadata.avatar_url,
        created_at: user.created_at,
        display_name: user.user_metadata.full_name,
        email: user.email,
        phone: user.phone,
        last_sign_in_at: user.last_sign_in_at,
        providers:
          (user.app_metadata
            .providers as GridaXSupabase.SupabaseAuthProvider[]) ??
          user.app_metadata.provider
            ? [
                user.app_metadata
                  .provider! as GridaXSupabase.SupabaseAuthProvider,
              ]
            : [],
      } satisfies XSBUserRow;
    });
  }
}

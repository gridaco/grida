import React, { useEffect, useCallback } from "react";
import styled from "@emotion/styled";
import { PageContentLayout } from "../../layouts";
import { TextField } from "../../components";
import { LinearProgress } from "@mui/material";
import { Button } from "@editor-ui/button";
import { Client, User } from "@design-sdk/figma-remote-api";
import { PreferencePageProps } from "../../core";
import { personal } from "@design-sdk/figma-auth-store";
import { HelpPanel } from "../../components";

export default function EditorPreferenceFigmaPersonalAccessTokenPage({
  state,
  dispatch,
}: PreferencePageProps) {
  return (
    <PageContentLayout direction="row" spacebetween>
      <div>
        <h1>Personal Access Tokens</h1>
        <TextField disabled value="ftk_xxxxxxxx" />
        <div>
          <RegisterNewFpat onSuccess={() => {}} />
        </div>
      </div>
      <HelpPanel
        url={
          "https://grida.co/docs/with-figma/guides/how-to-get-personal-access-token"
        }
      />
    </PageContentLayout>
  );
}

/**
 * masks figd_ABCDEFGHIJKLMNOPQRSTUVWXYZ to figd_xxxxxxxxxxxxxxxxxxxxVWXYZ
 * @param token
 * @returns
 */
function masking(token: string): string {
  // reveal first 5 and last 5
  const first = token.substring(0, 5);
  const last = token.substring(token.length - 5, token.length);
  const length = token.length - 10;
  const masked = "x".repeat(length);
  return first + masked + last;
}

function RegisterNewFpat({
  onSuccess,
}: {
  onSuccess: (token: string, user: User) => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [valid, setValid] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState("");
  const validate = async (token: string): Promise<false | User> => {
    try {
      const { data } = await Client({ personalAccessToken: token }).me();
      return data;
    } catch (e) {
      setError(
        "Invalid token - this token is expired or not issued from valid Figma account"
      );
      return false;
    }
  };

  const prevalidate = (value: string) => {
    return value.startsWith("figd_") && value.length > 10;
  };

  useEffect(() => {
    setValid(prevalidate(value));
    setError("");
  }, [value]);

  const onSubmit = useCallback(async () => {
    setLoading(true);
    const validated = await validate(value);
    if (validated) {
      onSuccess(value, validated);
      // clear value
      setValue("");
    }

    // else, leave it editable.

    setLoading(false);
  }, [value]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
      }}
    >
      <h5>Register new Figma Personal Access Token</h5>

      <div
        style={{
          display: "flex",
          flexDirection: "row",
          gap: 8,
        }}
      >
        <div style={{ width: "100%" }}>
          <TextField
            fullWidth
            placeholder="figd_xxxxxxxxxxxxx"
            value={value}
            onChange={setValue}
            onSubmit={onSubmit}
            disabled={loading}
          />
          <LinearProgress
            sx={{
              top: -2,
              height: 2,
              visibility: loading ? "visible" : "hidden",
              borderRadius: 4,
            }}
          />
        </div>
        <Button
          id="save-new-fpat"
          disabled={!valid || loading}
          onClick={onSubmit}
        >
          Save
        </Button>
      </div>
      {!!error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
}

const ErrorMessage = styled.span`
  width: 200px;
  font-style: italic;
  font-size: 10px;
  color: red;
  opacity: 0.4;
`;

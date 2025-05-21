import { ThemeProvider } from "@emotion/react";
import { Theme as EditorTheme, useTheme } from "@editor-ui/theme";

interface _Theme {
  app_posts_cms: {
    colors: {
      root_background: React.CSSProperties["color"];
      button_primary: React.CSSProperties["color"];
      button_danger: React.CSSProperties["color"];
    };
    editor: {
      title_text_align: React.CSSProperties["textAlign"];
    };
  };
}

export const theme: _Theme = {
  app_posts_cms: {
    colors: {
      root_background: "black",
      button_primary: "rgba(35, 77, 255, 0.9)",
      button_danger: "rgba(249, 34, 34, 0.9)",
    },
    editor: {
      title_text_align: "left",
    },
  },
};

export function PostsAppThemeProvider({
  children,
  theme: _theme,
}: {
  theme?: _Theme;
  children: React.ReactNode;
}) {
  const editorTheme = useTheme();
  return (
    <ThemeProvider theme={{ ...editorTheme, ...(_theme ?? theme) }}>
      {children}
    </ThemeProvider>
  );
}

// type _Theme = typeof theme;
export type Theme = _Theme;

// declare module "@emotion/react" {
//   export interface Theme extends EditorTheme, _Theme {}
// }

// export default styled as CreateStyled<EditorTheme & _Theme>;

export function themeFrom(theme): Theme {
  if (!theme) return;
  return {
    app_posts_cms: {
      colors: {
        root_background: theme.background,
        button_primary: theme.primary,
        // TODO: add button_danger
        button_danger: theme.primary,
      },
      editor: {
        title_text_align: theme.title_text_align,
      },
    },
  };
}

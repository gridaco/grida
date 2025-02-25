import { Env } from "@/env";

export function EndingPageEmbeddedPreview({
  template,
  lng,
  title,
}: {
  template: string;
  lng: string;
  title: string;
}) {
  switch (template) {
    case "receipt01": {
      return (
        <iframe
          key={template}
          src={
            Env.web.HOST +
            `/templates/embed/${lng}/formcomplete/${template}?title=${encodeURIComponent(title)}`
          }
          className="w-full h-96"
          style={{ border: 0 }}
        />
      );
    }
    case "default": {
      return (
        <iframe
          key={template}
          src={
            Env.web.HOST +
            `/templates/embed/${lng}/formcomplete/default?title=${encodeURIComponent(title)}`
          }
          className="w-full h-96"
          style={{ border: 0 }}
        />
      );
    }
  }
}

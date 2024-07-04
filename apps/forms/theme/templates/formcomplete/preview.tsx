const HOST_NAME = process.env.NEXT_PUBLIC_HOST_NAME || "http://localhost:3000";

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
            HOST_NAME +
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
            HOST_NAME +
            `/templates/embed/${lng}/formcomplete/default?title=${encodeURIComponent(title)}`
          }
          className="w-full h-96"
          style={{ border: 0 }}
        />
      );
    }
  }
}

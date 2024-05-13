import type { FormPageBackgroundSchema } from "@/types";

export function FormPageBackground({ element, src }: FormPageBackgroundSchema) {
  const renderBackground = () => {
    switch (element) {
      case "iframe":
        return <FormPageBackgroundIframe src={src!} />;
      default:
        return <></>;
    }
  };

  return (
    <div className="fixed select-none inset-0 -z-10">{renderBackground()}</div>
  );
}

export function FormPageBackgroundIframe({ src }: { src: string }) {
  return (
    <iframe
      allowTransparency
      className="absolute inset-0 w-screen h-screen -z-10 bg-transparent"
      src={src}
      width="100vw"
      height="100vh"
    />
  );
}

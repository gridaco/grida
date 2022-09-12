export default function CorsProxyPage() {
  return <></>;
}

export async function getServerSideProps(context: any) {
  return {
    redirect: {
      destination: "https://cors.sh",
      permanent: false,
    },
  };
}

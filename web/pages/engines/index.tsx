import React, { ReactElement, useRef } from "react";
import Head from "next/head";
import { Suspense } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import {
  Environment,
  Float,
  Grid,
  OrbitControls,
  Stars,
} from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import styled from "@emotion/styled";
import LandingpageText from "components/landingpage/text";
import Link from "next/link";
import { GitHubLogoIcon } from "@radix-ui/react-icons";
import { PageLayoutConfig } from "layouts/index";
import { getPageTranslations } from "utils/i18n";
import { NextPageContext } from "next";
import SectionLayout from "layouts/section";
import Footer from "components/footer";
import Header from "components/header";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader";

export default function EnginesPage() {
  return (
    <div>
      <Head>
        <title>Engines</title>
        <meta name="description" content="Grida Engine" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Main>
        <SectionLayout alignContent="start">
          <div className="layout">
            <LandingpageText color="white" variant="h1">
              Grida Engine
            </LandingpageText>
            <div style={{ height: 21 }} />
            <LandingpageText color="rgba(255, 255, 255, 0.8)" variant="body1">
              Explore the cutting edge engine techs by Grida, open to public.
            </LandingpageText>
            <Link href={"https://github.com/gridaco/engines"}>
              <button>
                <GitHubLogoIcon />
                Github
              </button>
            </Link>
          </div>
        </SectionLayout>
        <Scene />
      </Main>
    </div>
  );
}

EnginesPage.layoutConfig = {
  mt: 0,
} as PageLayoutConfig;

EnginesPage.getLayout = (page: ReactElement) => {
  return (
    <div
      style={{
        background: "black",
      }}
    >
      <Header />
      {page}
      <Footer />
    </div>
  );
};

EnginesPage.getTheme = () => "dark";

const Main = styled.main`
  min-height: 100vh;
  width: 100vw;

  .layout {
    max-width: 600px;
    position: absolute;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    height: 100%;
  }

  button {
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: 20px;
    padding: 10px 20px;
    border-radius: 5px;
    border: none;
    background-color: #000;
    color: #fff;
  }
`;

const Model = () => {
  // location of the 3D model
  const gltf = useLoader(
    GLTFLoader,
    "/models/rocket_engine_no_textures/compressed.glb",
    loader => {
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/");
      loader.setDRACOLoader(dracoLoader);
    },
  );

  return (
    <>
      <primitive object={gltf.scene} scale={1} />
    </>
  );
};

function Scene() {
  return (
    <SceneWrapper>
      <Canvas
        dpr={[1, 2]}
        camera={{
          position: [0, 1, 6],
          fov: 50,
        }}
      >
        <ambientLight intensity={0.5} />
        <spotLight
          intensity={0.1}
          angle={0.1}
          penumbra={1}
          position={[10, 15, 10]}
        />
        <Stars speed={0.1} />
        <Suspense fallback={null}>
          <Float speed={0.5}>
            <Model />
          </Float>
          <Float
            floatingRange={[0, 0.2]}
            rotation={[0.1, Math.PI, 1]}
            speed={0.1}
          >
            <Grid cellColor="white" args={[100, 100]} />
          </Float>
          {/* To add environment effect to the model */}
          <Environment preset="studio" />
        </Suspense>
        <OrbitControls enabled={false} enableZoom={false} />
      </Canvas>
    </SceneWrapper>
  );
}

const SceneWrapper = styled.div`
  position: absolute;
  z-index: 1;
  display: grid;
  place-items: center;
  height: 100vh;
  width: 100%;
  background: black;
`;

export async function getStaticProps({ req, locale }: NextPageContext) {
  return {
    props: {
      ...(await getPageTranslations(locale)),
    },
  };
}

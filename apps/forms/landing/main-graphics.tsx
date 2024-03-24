"use client";

import { Canvas, useLoader } from "@react-three/fiber";
import { CubeCamera, Environment, PerspectiveCamera } from "@react-three/drei";
import { ReactNode, Suspense } from "react";
// @ts-ignore
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

function Model() {
  //   const gltf = useLoader(GLTFLoader, "/assets/landing/hero.gltf");
  const gltf = useLoader(GLTFLoader, "/assets/landing/hero.gltf");
  return <>{gltf ? <primitive object={gltf.scene} /> : null}</>;
}

export function HeroMainGraphic() {
  return (
    <div className="absolute w-screen h-screen">
      {/*  */}
      <Canvas>
        <PerspectiveCamera />

        {/* <ambientLight /> */}
        <Environment preset="city" />
        <Suspense>
          <Model />
        </Suspense>
        {/*  */}
      </Canvas>
    </div>
  );
}

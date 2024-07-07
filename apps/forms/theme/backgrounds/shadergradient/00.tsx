import React from "react";
import { ShaderGradientCanvas, ShaderGradient } from "shadergradient";
// import * as reactSpring from "@react-spring/three";
import * as drei from "@react-three/drei";
import * as fiber from "@react-three/fiber";

function _001() {
  return (
    <ShaderGradientCanvas
      importedFiber={{ ...fiber, ...drei }}
      style={{
        position: "absolute",
        top: 0,
      }}
    >
      <ShaderGradient cDistance={32} cPolarAngle={125} />
    </ShaderGradientCanvas>
  );
}

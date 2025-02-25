"use client";
import React from "react";
import { ShaderGradientCanvas, ShaderGradient } from "shadergradient";

export default function _93() {
  return (
    <ShaderGradientCanvas
      style={{
        position: "absolute",
        top: 0,
      }}
      // https://github.com/ruucm/shadergradient/issues/87
      onCreated={(_: any) => {
        _.gl.domElement.style.pointerEvents = "none"; // Disable interactions
      }}
    >
      <ShaderGradient
        control="query"
        urlString="https://www.shadergradient.co/customize?animate=off&axesHelper=on&bgColor1=%23000000&bgColor2=%23000000&brightness=1.2&cAzimuthAngle=180&cDistance=5.4&cPolarAngle=90&cameraZoom=18&color1=%23f9e7d1&color2=%23004d99&color3=%23f9f4d1&destination=onCanvas&embedMode=off&envPreset=city&format=gif&fov=40&frameRate=10&grain=on&lightType=3d&pixelDensity=3&positionX=0&positionY=0.6&positionZ=0&range=enabled&rangeEnd=21&rangeStart=13.9&reflection=0.1&rotationX=0&rotationY=0&rotationZ=90&shader=defaults&type=plane&uAmplitude=3.1&uDensity=0&uFrequency=5.5&uSpeed=0.1&uStrength=8.6&uTime=6.3&wireframe=false"
      />
    </ShaderGradientCanvas>
  );
}

"use client";
import React from "react";
import { ShaderGradientCanvas, ShaderGradient } from "shadergradient";

export default function _91() {
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
        urlString="https://www.shadergradient.co/customize?animate=on&axesHelper=on&bgColor1=%23000000&bgColor2=%23000000&brightness=1.2&cAzimuthAngle=180&cDistance=3.5&cPolarAngle=95&cameraZoom=1&color1=%23ffffff&color2=%231000f3&color3=%23ffffff&destination=onCanvas&embedMode=off&envPreset=dawn&format=gif&fov=45&frameRate=10&grain=on&lightType=3d&pixelDensity=3&positionX=0&positionY=0.6&positionZ=0&range=enabled&rangeEnd=27.1&rangeStart=0&reflection=0.1&rotationX=0&rotationY=0&rotationZ=45&shader=defaults&type=waterPlane&uAmplitude=0&uDensity=1&uFrequency=5.5&uSpeed=0.1&uStrength=2.3&uTime=0&wireframe=false"
      />
    </ShaderGradientCanvas>
  );
}

"use client";
import React from "react";
import { ShaderGradientCanvas, ShaderGradient } from "shadergradient";

export default function _92() {
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
        urlString="https://www.shadergradient.co/customize?animate=on&axesHelper=on&bgColor1=%23000000&bgColor2=%23000000&brightness=1.2&cAzimuthAngle=180&cDistance=3.5&cPolarAngle=95&cameraZoom=1&color1=%23ffffff&color2=%23E2F35A&color3=%23ffffff&destination=onCanvas&embedMode=off&envPreset=dawn&format=gif&fov=45&frameRate=10&grain=on&lightType=3d&pixelDensity=3&positionX=0&positionY=0.6&positionZ=0&range=enabled&rangeEnd=40&rangeStart=5.1&reflection=0.1&rotationX=0&rotationY=0&rotationZ=45&shader=defaults&type=plane&uAmplitude=0&uDensity=7&uFrequency=5.5&uSpeed=1.3&uStrength=0.4&uTime=5.1&wireframe=false"
      />
    </ShaderGradientCanvas>
  );
}

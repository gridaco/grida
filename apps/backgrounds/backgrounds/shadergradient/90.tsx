"use client";
import React from "react";
import { ShaderGradientCanvas, ShaderGradient } from "shadergradient";

export default function _90() {
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
        urlString="https://www.shadergradient.co/customize?animate=on&axesHelper=off&bgColor1=%23000000&bgColor2=%23000000&brightness=1.5&cAzimuthAngle=200&cDistance=5.1&cPolarAngle=80&cameraZoom=20.1&color1=%23d5d6c5&color2=%23003b35&color3=%23000000&destination=onCanvas&embedMode=off&envPreset=city&format=gif&fov=45&frameRate=10&gizmoHelper=hide&grain=on&lightType=3d&pixelDensity=2.2&positionX=0.5&positionY=-0.6&positionZ=0&range=enabled&rangeEnd=40&rangeStart=0&reflection=0.5&rotationX=0&rotationY=10&rotationZ=0&shader=defaults&type=plane&uAmplitude=1.7&uDensity=2.4&uFrequency=5.5&uSpeed=0.1&uStrength=1.2&uTime=0&wireframe=false"
      />
    </ShaderGradientCanvas>
  );
}

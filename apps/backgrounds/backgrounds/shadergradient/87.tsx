"use client";
import React from "react";
import { ShaderGradientCanvas, ShaderGradient } from "shadergradient";

export default function _87() {
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
        urlString="https://www.shadergradient.co/customize?animate=on&axesHelper=off&bgColor1=%23000000&bgColor2=%23000000&brightness=1.5&cAzimuthAngle=250&cDistance=1.5&cPolarAngle=140&cameraZoom=18.4&color1=%23d66e69&color2=%23fcfffd&color3=%23ccfffa&destination=onCanvas&embedMode=off&envPreset=city&format=gif&fov=45&frameRate=10&gizmoHelper=hide&grain=on&lightType=3d&pixelDensity=2&positionX=0&positionY=-0.5&positionZ=-0.1&range=enabled&rangeEnd=40&rangeStart=0&reflection=0.5&rotationX=0&rotationY=0&rotationZ=140&shader=defaults&type=sphere&uAmplitude=3.8&uDensity=1.3&uFrequency=5.5&uSpeed=0.4&uStrength=0.3&uTime=0&wireframe=false"
      />
    </ShaderGradientCanvas>
  );
}

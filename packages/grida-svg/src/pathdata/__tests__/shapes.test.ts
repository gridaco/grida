import { describe, test, expect } from "vitest";
import { SVGShapes } from "../index.js";

describe("SVGShapes", () => {
  describe("createEllipse", () => {
    test("should create a valid ellipse path", () => {
      const ellipse = SVGShapes.createEllipse(100, 50, 200, 150);
      expect(ellipse.encode()).toBe(
        "M300 150A100 50 0 1 1 100 150A100 50 0 1 1 300 150z"
      );
    });

    test("should create a circle when rx equals ry", () => {
      const circle = SVGShapes.createEllipse(50, 50, 100, 100);
      expect(circle.encode()).toBe(
        "M150 100A50 50 0 1 1 50 100A50 50 0 1 1 150 100z"
      );
    });
  });

  describe("createRect", () => {
    test("should create a simple rectangle without rounded corners", () => {
      const rect = SVGShapes.createRect(10, 20, 200, 100);
      expect(rect.encode()).toBe("M10 20L210 20L210 120L10 120z");
    });

    test("should create a rectangle with rounded corners", () => {
      const roundedRect = SVGShapes.createRect(10, 20, 200, 100, 15, 10);
      expect(roundedRect.encode()).toBe(
        "M25 20L195 20A15 10 0 0 1 210 30L210 110A15 10 0 0 1 195 120L25 120A15 10 0 0 1 10 110L10 30A15 10 0 0 1 25 20z"
      );
    });

    test("should cap radius to half width/height if too large", () => {
      const rect = SVGShapes.createRect(10, 20, 100, 60, 60, 40);
      expect(rect.encode()).toBe(
        "M60 20L60 20A50 30 0 0 1 110 50L110 50A50 30 0 0 1 60 80L60 80A50 30 0 0 1 10 50L10 50A50 30 0 0 1 60 20z"
      );
    });
  });

  describe("createPolyline", () => {
    test("should create a valid polyline from coordinates", () => {
      const polyline = SVGShapes.createPolyline([10, 20, 30, 40, 50, 10]);
      expect(polyline.encode()).toBe("M10 20L30 40L50 10");
    });

    test("should create a valid polyline with exactly 2 points", () => {
      const polyline = SVGShapes.createPolyline([10, 20, 30, 40]);
      expect(polyline.encode()).toBe("M10 20L30 40");
    });

    test("should return empty path data for insufficient coordinates", () => {
      const polyline = SVGShapes.createPolyline([10]);
      expect(polyline.encode()).toBe("");
    });
  });

  describe("createPolygon", () => {
    test("should create a closed polygon from coordinates", () => {
      const polygon = SVGShapes.createPolygon([10, 20, 30, 40, 50, 10]);
      expect(polygon.encode()).toBe("M10 20L30 40L50 10z");
    });

    test("should create a valid polygon with exactly 2 points", () => {
      const polygon = SVGShapes.createPolygon([10, 20, 30, 40]);
      expect(polygon.encode()).toBe("M10 20L30 40z");
    });

    test("should return empty path data for insufficient coordinates", () => {
      const polygon = SVGShapes.createPolygon([10]);
      expect(polygon.encode()).toBe("");
    });
  });
});

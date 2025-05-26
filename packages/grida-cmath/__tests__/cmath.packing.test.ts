import cmath from "..";

describe("cmath.packing", () => {
  describe("fit", () => {
    test("returns top-left placement when there are no anchors", () => {
      const view = { x: 0, y: 0, width: 100, height: 100 };
      const agent = { width: 10, height: 10 };
      const anchors: cmath.Rectangle[] = [];
      const result = cmath.packing.fit(view, agent, anchors);
      expect(result).toEqual({ x: 0, y: 0, width: 10, height: 10 });
    });

    test("returns next free region when an anchor occupies the top-left area", () => {
      const view = { x: 0, y: 0, width: 100, height: 100 };
      const agent = { width: 10, height: 10 };
      // Occupies the top-left quarter of the view.
      const anchors = [{ x: 0, y: 0, width: 50, height: 50 }];
      const result = cmath.packing.fit(view, agent, anchors);
      // After subtracting, free regions:
      // - Right region: { x: 50, y: 0, width: 50, height: 50 }
      // - Bottom region: { x: 0, y: 50, width: 100, height: 50 }
      // Sorted by y then x, the right region (y=0) comes first.
      expect(result).toEqual({ x: 50, y: 0, width: 10, height: 10 });
    });

    test("returns null when the agent is larger than the view", () => {
      const view = { x: 0, y: 0, width: 30, height: 30 };
      const agent = { width: 40, height: 40 };
      const anchors: cmath.Rectangle[] = [];
      const result = cmath.packing.fit(view, agent, anchors);
      expect(result).toBeNull();
    });

    test("returns placement in the top-most free region when anchors create multiple free areas", () => {
      const view = { x: 0, y: 0, width: 100, height: 100 };
      const agent = { width: 20, height: 20 };
      // Anchor in the center of the view.
      const anchors = [{ x: 40, y: 40, width: 20, height: 20 }];
      const result = cmath.packing.fit(view, agent, anchors);
      // Subtracting the center anchor from the view yields:
      // - Top region: { x: 0, y: 0, width: 100, height: 40 }
      // - Bottom region: { x: 0, y: 60, width: 100, height: 40 }
      // - Left region: { x: 0, y: 40, width: 40, height: 20 }
      // - Right region: { x: 60, y: 40, width: 40, height: 20 }
      // Sorting by y then x, the top region (y = 0) is first.
      expect(result).toEqual({ x: 0, y: 0, width: 20, height: 20 });
    });

    test("complex anchors create multiple free regions and return the lexicographically smallest by (y, x)", () => {
      // View: 200x200 starting at (0,0)
      const view = { x: 0, y: 0, width: 200, height: 200 };
      // Agent: 50x50 rectangle to be placed
      const agent = { width: 50, height: 50 };

      // Define three anchors:
      // 1. Anchor1 occupies {x:25, y:25, width:100, height:50}
      //    Subtracting Anchor1 from view yields:
      //      - Top region: {0,0,200,25}
      //      - Bottom region: {0,75,200,125}
      //      - Left region: {0,25,25,50}
      //      - Right region: {125,25,75,50}
      //
      // 2. Anchor2 occupies {x:75, y:75, width:100, height:100}
      //    When subtracted from the bottom region ({0,75,200,125}) of view,
      //    it yields:
      //      - Left: {0,75,75,100}
      //      - Right: {175,75,25,100}
      //      - Bottom: {0,175,200,25}
      //    (The top region from Anchor1 remains unchanged.)
      //
      // 3. Anchor3 occupies {x:-50, y:150, width:100, height:50}
      //    When subtracting from {0,75,75,100} (from Anchor2's subtraction),
      //    it cuts a portion from the left free region:
      //      - The intersection on that region is {0,150,50,25},
      //        yielding two subregions:
      //         • Top: {0,75,75,75}
      //         • Right: {50,150,25,25} (discarded later due to insufficient size)
      //    Also, subtracting from {0,175,200,25} removes the left part,
      //    leaving {50,175,150,25} (too short in height, discarded).
      //
      // After all subtractions, the free regions that can host a 50x50 agent are:
      //   - Region A: {0,75,75,75} from the adjusted left region.
      //   - Region B: {125,25,75,50} from the right region (unchanged from Anchor1).
      // Region A has y=75, x=0; Region B has y=25, x=125.
      // Sorting by y then x, Region B comes first.
      // Hence, the chosen placement is at (125, 25) with agent dimensions.
      const anchors = [
        { x: 25, y: 25, width: 100, height: 50 },
        { x: 75, y: 75, width: 100, height: 100 },
        { x: -50, y: 150, width: 100, height: 50 },
      ];

      const result = cmath.packing.fit(view, agent, anchors);
      expect(result).toEqual({ x: 125, y: 25, width: 50, height: 50 });
    });
  });
});

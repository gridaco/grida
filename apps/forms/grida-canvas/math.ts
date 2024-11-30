export namespace cmath {
  export namespace vector2 {
    export function add(
      a: [number, number],
      b: [number, number]
    ): [number, number] {
      return [a[0] + b[0], a[1] + b[1]];
    }

    export function subtract(
      a: [number, number],
      b: [number, number]
    ): [number, number] {
      return [a[0] - b[0], a[1] - b[1]];
    }
  }
}

export interface StarBand {
  stars: 1 | 2 | 3;
  min: number;
  max: number;
}

/** Total ingredients parked during the cook, independent of storage capacity. */
export function starBands(par: number): StarBand[] {
  return [
    { stars: 3, min: 0, max: par },
    { stars: 2, min: par + 1, max: par + 2 },
    { stars: 1, min: par + 3, max: Infinity },
  ];
}

export function starsFor(uses: number, par: number): 1 | 2 | 3 {
  return starBands(par).find((band) => uses <= band.max)!.stars;
}

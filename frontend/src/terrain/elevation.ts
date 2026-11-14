const dnMax = 65535

export function elevationFromDn(dn: number, zminM: number, zmaxM: number) {
  return zminM + (dn / dnMax) * (zmaxM - zminM)
}

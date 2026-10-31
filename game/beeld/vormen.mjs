// Eigen vormen van het bord, in code gemaakt (geen bestanden, geen netwerk): de vloer met een kleur per vakje,
// de tegelvoegen en een vijfpuntige ster. Chromebook-budget: de vloer is één draw call (480 driehoeken), de
// voegtextuur 64 px, de ster 40 driehoeken.
import * as pc from 'playcanvas';
import { KOLOMMEN, RIJEN } from '../logica/raster.mjs';

// Eén vierkant per vakje, met eigen hoekpunten: zo krijgt elk vakje een vlakke eigen kleur (vertexkleur) en
// loopt de tegeltextuur per vakje van 0 tot 1 (een voeg rond elk vakje).
export function maakVloerMesh(device) {
  const pos = [];
  const nrm = [];
  const uv = [];
  const idx = [];
  for (let r = 0; r < RIJEN; r++) {
    for (let k = 0; k < KOLOMMEN; k++) {
      const i = pos.length / 3;
      pos.push(k, 0, r, k + 1, 0, r, k + 1, 0, r + 1, k, 0, r + 1);
      nrm.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      idx.push(i, i + 2, i + 1, i, i + 3, i + 2); // tegen de klok in, van boven gezien: de voorkant wijst omhoog
    }
  }
  const mesh = new pc.Mesh(device);
  mesh.setPositions(pos);
  mesh.setNormals(nrm);
  mesh.setUvs(0, uv);
  mesh.setColors32(new Uint8Array(KOLOMMEN * RIJEN * 16).fill(255));
  mesh.setIndices(idx);
  mesh.update();
  return mesh;
}

// kleurVan(k, r) -> [r, g, b] (sRGB, 0-255) voor elk vakje.
export function kleurVloer(mesh, kleurVan) {
  const c = new Uint8Array(KOLOMMEN * RIJEN * 16);
  let i = 0;
  for (let r = 0; r < RIJEN; r++) {
    for (let k = 0; k < KOLOMMEN; k++) {
      const [R, G, B] = kleurVan(k, r);
      for (let hoek = 0; hoek < 4; hoek++) c.set([R, G, B, 255], (i++) * 4);
    }
  }
  mesh.setColors32(c);
  mesh.update();
}

// Tegelvoegen: wit met een iets donkerdere rand; het vloermateriaal vermenigvuldigt dit met de vakjeskleur.
export function maakVoegTextuur(device, { maat = 64, voeg = 2, grijs = 185 } = {}) {
  const t = new pc.Texture(device, {
    name: 'voegen', width: maat, height: maat, format: pc.PIXELFORMAT_RGBA8, mipmaps: true,
    addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE,
  });
  const px = t.lock();
  for (let y = 0; y < maat; y++) {
    for (let x = 0; x < maat; x++) {
      const v = Math.min(x, y, maat - 1 - x, maat - 1 - y) < voeg ? grijs : 255;
      px.set([v, v, v, 255], (y * maat + x) * 4);
    }
  }
  t.unlock();
  return t;
}

// Vijfpuntige ster rechtop in het xy-vlak (punt omhoog), met dikte in z: voor- en achterkant als waaier vanuit
// het midden, de zijkanten als vlakjes met een eigen normaal (vlak belicht).
export function maakSterMesh(device, { buiten = 0.38, binnen = 0.17, dik = 0.12 } = {}) {
  const rand = Array.from({ length: 10 }, (_, i) => {
    const hoek = Math.PI / 2 + (i * Math.PI) / 5;
    const straal = i % 2 ? binnen : buiten;
    return [Math.cos(hoek) * straal, Math.sin(hoek) * straal];
  });
  const h = dik / 2;
  const pos = [];
  const nrm = [];
  const idx = [];
  const punt = (x, y, z, n) => {
    pos.push(x, y, z);
    nrm.push(...n);
    return pos.length / 3 - 1;
  };
  for (const [z, n] of [[h, [0, 0, 1]], [-h, [0, 0, -1]]]) {
    const midden = punt(0, 0, z, n);
    const ring = rand.map(([x, y]) => punt(x, y, z, n));
    for (let i = 0; i < 10; i++) {
      const [a, b] = [ring[i], ring[(i + 1) % 10]];
      if (z > 0) idx.push(midden, a, b); // voorkant: tegen de klok in vanaf +z
      else idx.push(midden, b, a);
    }
  }
  for (let i = 0; i < 10; i++) {
    const [x0, y0] = rand[i];
    const [x1, y1] = rand[(i + 1) % 10];
    const l = Math.hypot(x1 - x0, y1 - y0);
    const n = [(y1 - y0) / l, -(x1 - x0) / l, 0]; // naar buiten
    const a = punt(x0, y0, h, n);
    const b = punt(x1, y1, h, n);
    const c = punt(x1, y1, -h, n);
    const d = punt(x0, y0, -h, n);
    idx.push(a, d, c, a, c, b);
  }
  const mesh = new pc.Mesh(device);
  mesh.setPositions(pos);
  mesh.setNormals(nrm);
  mesh.setIndices(idx);
  mesh.update();
  mesh.incRefCount(); // gedeeld door alle sterren en levels: niet mee weggooien met het laatste level
  return mesh;
}

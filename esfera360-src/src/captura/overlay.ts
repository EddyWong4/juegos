// Dibujo de la guía sobre la cámara: puntos objetivo en la esfera, retícula y flecha.
import { conjugado, rotar, type Quat } from '../nucleo/cuaternion';
import type { Objetivo } from '../nucleo/plan-tomas';
import { lonLatADireccion } from '../nucleo/proyeccion';

export interface EstadoGuia {
  q: Quat;
  plan: Objetivo[];
  tomadas: Set<number>;
  actual: Objetivo | null;
  alineado: boolean; // apunta al objetivo
  derecho: boolean; // no está ladeado
  avance: number; // 0..1 del tiempo quieto antes de disparar
  focalPantalla: number; // px CSS
}

const VERDE = '#4ade80';
const ROJO = '#f87171';

export function dibujarGuia(ctx: CanvasRenderingContext2D, ancho: number, alto: number, e: EstadoGuia) {
  ctx.clearRect(0, 0, ancho, alto);
  const cx = ancho / 2;
  const cy = alto / 2;
  const inv = conjugado(e.q);

  const proyectar = (o: Objetivo) => {
    const c = rotar(inv, lonLatADireccion(o.yaw, o.pitch));
    if (c[2] >= -0.05) return { visible: false, c };
    const x = cx + (e.focalPantalla * c[0]) / -c[2];
    const y = cy - (e.focalPantalla * c[1]) / -c[2];
    return { visible: x > -40 && x < ancho + 40 && y > -40 && y < alto + 40, x, y, c };
  };

  // Objetivos
  for (const o of e.plan) {
    if (o === e.actual) continue;
    const p = proyectar(o);
    if (!p.visible) continue;
    ctx.beginPath();
    if (e.tomadas.has(o.n)) {
      ctx.fillStyle = 'rgba(74,222,128,0.85)';
      ctx.arc(p.x!, p.y!, 7, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 3;
      ctx.arc(p.x!, p.y!, 14, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Retícula central
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 30, 0, Math.PI * 2);
  ctx.moveTo(cx - 8, cy);
  ctx.lineTo(cx + 8, cy);
  ctx.moveTo(cx, cy - 8);
  ctx.lineTo(cx, cy + 8);
  ctx.stroke();

  if (!e.actual) return;
  const color = e.alineado && e.derecho ? VERDE : ROJO;
  const p = proyectar(e.actual);
  if (p.visible) {
    ctx.fillStyle = color + '55';
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(p.x!, p.y!, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (e.avance > 0) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(cx, cy, 38, -Math.PI / 2, -Math.PI / 2 + e.avance * Math.PI * 2);
      ctx.stroke();
    }
  }
  // Flecha si el objetivo está lejos del centro o fuera de la pantalla
  const dx = p.visible ? p.x! - cx : p.c[0];
  const dy = p.visible ? p.y! - cy : -p.c[1];
  const lejos = !p.visible || Math.hypot(dx, dy) > Math.min(ancho, alto) * 0.3;
  if (lejos) {
    const ang = Math.hypot(dx, dy) < 1e-6 ? 0 : Math.atan2(dy, dx);
    const r = Math.min(ancho, alto) * 0.3;
    ctx.save();
    ctx.translate(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
    ctx.rotate(ang);
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(26, 0);
    ctx.lineTo(-12, -20);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-12, 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  // Línea de horizonte cuando el teléfono está ladeado
  if (!e.derecho) {
    ctx.strokeStyle = ROJO;
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(cx - 80, cy);
    ctx.lineTo(cx + 80, cy);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

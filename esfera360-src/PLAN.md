# Esfera360 — Plan técnico (antes de programar)

PWA para capturar, coser, ver y compartir fotos esféricas 360°, inspirada en las
funciones de «Teleport: 360° Camera» (sin usar su nombre, marca ni recursos).
Todo con software libre; la app funciona completa sin cuenta y sin red.

---

## 1. Arquitectura

```
┌──────────────────────────── Navegador (todo offline) ────────────────────────────┐
│                                                                                  │
│  UI React + Tailwind (HashRouter: funciona en GitHub Pages sin reglas de 404)    │
│   Biblioteca · Captura · Cosido · Visor · Explorar · Mapa · Perfil · Ajustes     │
│        │             │           │          │                                    │
│        ▼             ▼           ▼          ▼                                    │
│  datos/ (idb)   sensores/    cosido/    visor/ (Photo Sphere Viewer + three)    │
│  IndexedDB:     cámara,      Worker:    giroscopio, estéreo, planeta pequeño,    │
│  capturas,      orientación  etapa A    encuadre plano, WebXR                    │
│  tomas (Blob),  (cuaterniones)  etapa B (OpenCV.js WASM, bajo demanda)           │
│  panoramas,                  codificador JPEG WASM + XMP GPano + EXIF            │
│  cola subidas                                                                    │
│        │                                                                         │
│  nucleo/ (TypeScript puro, sin DOM, con pruebas): cuaterniones, proyección       │
│  equirectangular, plan de tomas, campo de visión, segmentos JPEG/XMP/EXIF        │
│                                                                                  │
│  Service Worker (vite-plugin-pwa / Workbox):                                     │
│   - precache del núcleo (ligero)                                                 │
│   - caché en tiempo de ejecución para OpenCV.js, modelo de profundidad, teselas  │
└───────────────┬──────────────────────────────────────────────────────────────────┘
                │ solo por acción explícita del usuario
                ▼
┌──────────── Supabase (plan gratuito, opcional) ────────────┐   ┌─ Google (bandera) ─┐
│ Auth (enlace mágico) · Postgres + RLS · Storage            │   │ Street View        │
│ Edge Function «eliminar-cuenta» (service role)             │   │ Publish API (OAuth)│
└────────────────────────────────────────────────────────────┘   └────────────────────┘
                ▲
                │ ver.html?id=…  (visor público ligero, sin React, embebible en iframe)
```

Decisiones clave:

- **Dos puntos de entrada de Vite**: `index.html` (la app completa) y `ver.html`
  (visor público: solo PSV + fetch a Supabase, ~200 KB). Así el enlace compartido
  y el `<iframe>` cargan rápido y sin instalar nada.
- **Orientación en cuaterniones**, nunca en ángulos de Euler internamente: cerca del
  cenit/nadir y con el teléfono de cabeza los Euler sufren bloqueo de cardán.
  yaw/pitch/roll se guardan solo como dato derivado para mostrar.
- **El lienzo final no es un `<canvas>`**: se compone en un `Uint8ClampedArray` por
  franjas dentro del Worker y se codifica a JPEG con un codificador WASM (jSquash
  MozJPEG). Motivo: Safari iOS limita un canvas a 16,7 MP y un 8K son 33,5 MP.
- **El visor usa teselas generadas en el dispositivo** para panoramas > tamaño
  máximo de textura WebGL (muchos móviles: 4096 u 8192). PSV
  `EquirectangularTilesAdapter` con teselas guardadas en IndexedDB.
- **Toda la matemática en `nucleo/`** sin dependencias del navegador → pruebas
  unitarias con Vitest en Node.

### Modelo de datos local (IndexedDB, librería `idb`)

| Almacén       | Clave        | Contenido                                                                 |
|---------------|--------------|---------------------------------------------------------------------------|
| `capturas`    | `id` (uuid)  | título, estado (`borrador` / `procesando` / `listo` / `error`), fechas, lente, FOV, plan de tomas, GPS opcional, ajustes de cosido, id remoto y visibilidad si se compartió |
| `tomas`       | `[captura, n]` | Blob JPEG, cuaternión, yaw/pitch/roll, objetivo al que corresponde, marca de tiempo, exposición si se conoce |
| `panoramas`   | `captura`    | Blob JPEG final (con XMP), ancho/alto, miniatura, teselas para el visor   |
| `cola`        | `id`         | subidas pendientes con reintentos y último error                          |
| `ajustes`     | clave        | preferencias (resolución, logotipo del nadir, banderas de funciones)      |

---

## 2. Estructura de carpetas

```
esfera360-src/                 código fuente; «npm run build» compila hacia ../esfera360/
├── index.html                 app completa
├── ver.html                   visor público para enlaces e iframes
├── vite.config.ts             2 entradas, vite-plugin-pwa, base configurable
├── tailwind.config.ts · postcss.config.js · tsconfig.json · package.json
├── public/
│   ├── iconos/                íconos PWA (192, 512, maskable)
│   └── ejemplos/              un panorama de muestra libre para probar el visor
├── src/
│   ├── main.tsx · App.tsx · rutas.tsx
│   ├── pantallas/             Biblioteca, Captura, Cosido, Visor, Explorar, Mapa, Perfil, Ajustes
│   ├── componentes/           Botón (44 px mín.), Tarjeta, BarraProgreso, Aviso, Diálogo…
│   ├── nucleo/                ── TypeScript puro, probado ──
│   │   ├── cuaternion.ts          operaciones, desde DeviceOrientation, a/desde matriz
│   │   ├── proyeccion.ts          píxel ↔ dirección 3D ↔ (lon, lat) equirectangular
│   │   ├── camara-pinhole.ts      intrínsecos K desde FOV; proyección de rayos
│   │   ├── plan-tomas.ts          anillos, número de tomas por FOV y traslape
│   │   ├── alineacion.ts          error angular toma/objetivo, flecha de guía
│   │   ├── mezcla.ts              pesos de feathering
│   │   └── jpeg/                  segmentos APP1, XMP GPano, EXIF GPS
│   ├── datos/                 db.ts, capturas.ts, cola-subidas.ts, almacenamiento.ts
│   ├── sensores/              capacidades.ts, camara.ts, orientacion.ts, permisos.ts
│   ├── cosido/                worker.ts, etapa-a.ts, etapa-b.ts, opencv.ts (carga
│   │                          perezosa), exposicion.ts, nadir.ts, teselas.ts
│   ├── visor/                 VisorEsfera.tsx, planeta-pequeno.ts, encuadre-plano.ts, xr.ts
│   ├── nube/                  cliente.ts, auth.ts, subir.ts, explorar.ts, perfil.ts
│   ├── streetview/            (bandera) oauth.ts, publicar.ts
│   ├── profundidad/           (experimental) worker.ts, malla.ts, joystick.tsx
│   ├── publico/ver.ts         lógica de ver.html
│   └── textos/es.ts           todas las cadenas de la interfaz
├── tests/                     *.test.ts (Vitest) — proyección, plan, cuaterniones, XMP
├── supabase/
│   ├── migrations/0001_esquema.sql
│   └── functions/eliminar-cuenta/index.ts
└── docs/
    ├── prueba-en-telefono.md
    ├── supabase.md
    └── street-view.md
```

---

## 3. Esquema SQL de Supabase con RLS

Visibilidad por captura en la nube:

- `privada`: solo el dueño (bucket privado, URL firmadas).
- `enlace`: cualquiera con el enlace; **no** aparece en Explorar ni en el mapa.
- `publica`: aparece en Explorar y en el mapa.

Para que `enlace` no se pueda listar, la política de lectura solo deja ver las
públicas; las de enlace se leen con una función `obtener_panorama(id)`.

```sql
-- 0001_esquema.sql
create extension if not exists pgcrypto;

-- ───────── Perfiles ─────────
create table public.perfiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  nombre        text not null default 'Anónimo'
                check (char_length(nombre) between 1 and 50),
  creado        timestamptz not null default now()
);

create table public.administradores (
  usuario uuid primary key references auth.users(id) on delete cascade
);

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from administradores where usuario = auth.uid());
$$;

-- Crear perfil automáticamente al registrarse
create or replace function public.crear_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfiles (id) values (new.id);
  return new;
end $$;

create trigger al_crear_usuario after insert on auth.users
  for each row execute function public.crear_perfil();

-- ───────── Panoramas ─────────
create type public.visibilidad as enum ('privada', 'enlace', 'publica');

create table public.panoramas (
  id            uuid primary key default gen_random_uuid(),
  dueno         uuid not null default auth.uid()
                references public.perfiles(id) on delete cascade,
  titulo        text not null default '' check (char_length(titulo) <= 120),
  descripcion   text not null default '' check (char_length(descripcion) <= 2000),
  visibilidad   public.visibilidad not null default 'enlace',
  ruta_imagen   text not null,          -- <dueno>/<id>/pano.jpg
  ruta_miniatura text not null,         -- <dueno>/<id>/mini.jpg
  ancho         int  not null check (ancho > 0),
  alto          int  not null check (alto > 0),
  lat           double precision check (lat between -90 and 90),
  lng           double precision check (lng between -180 and 180),
  capturado     timestamptz,
  creado        timestamptz not null default now(),
  me_gusta      int not null default 0,
  oculto        boolean not null default false   -- moderación
);
create index panoramas_feed on public.panoramas (creado desc)
  where visibilidad = 'publica' and not oculto;
create index panoramas_dueno on public.panoramas (dueno, creado desc);

-- ───────── Me gusta ─────────
create table public.me_gusta (
  panorama  uuid not null references public.panoramas(id) on delete cascade,
  usuario   uuid not null default auth.uid() references public.perfiles(id) on delete cascade,
  creado    timestamptz not null default now(),
  primary key (panorama, usuario)
);

create or replace function public.contar_me_gusta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update panoramas set me_gusta = me_gusta + 1 where id = new.panorama;
  else
    update panoramas set me_gusta = greatest(me_gusta - 1, 0) where id = old.panorama;
  end if;
  return null;
end $$;
create trigger me_gusta_contador after insert or delete on public.me_gusta
  for each row execute function public.contar_me_gusta();

-- ───────── Reportes ─────────
create table public.reportes (
  id        uuid primary key default gen_random_uuid(),
  panorama  uuid not null references public.panoramas(id) on delete cascade,
  autor     uuid not null default auth.uid() references public.perfiles(id) on delete cascade,
  motivo    text not null check (motivo in ('inapropiado','privacidad','derechos','spam','otro')),
  detalle   text not null default '' check (char_length(detalle) <= 1000),
  estado    text not null default 'pendiente' check (estado in ('pendiente','revisado','descartado')),
  creado    timestamptz not null default now(),
  unique (panorama, autor)
);

-- ───────── RLS ─────────
alter table public.perfiles        enable row level security;
alter table public.administradores enable row level security;
alter table public.panoramas       enable row level security;
alter table public.me_gusta        enable row level security;
alter table public.reportes        enable row level security;

-- perfiles: nombre visible es público; cada quien edita el suyo
create policy perfiles_leer      on public.perfiles for select using (true);
create policy perfiles_editar    on public.perfiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- administradores: solo los propios administradores la ven; nadie la edita desde el cliente
create policy admins_leer on public.administradores for select using (public.es_admin());

-- panoramas
create policy panoramas_leer on public.panoramas for select using (
  (visibilidad = 'publica' and not oculto)
  or dueno = auth.uid()
  or public.es_admin()
);
create policy panoramas_crear on public.panoramas for insert
  with check (dueno = auth.uid() and oculto = false and me_gusta = 0);
create policy panoramas_editar on public.panoramas for update
  using (dueno = auth.uid()) with check (dueno = auth.uid());
create policy panoramas_borrar on public.panoramas for delete
  using (dueno = auth.uid() or public.es_admin());
create policy panoramas_moderar on public.panoramas for update
  using (public.es_admin()) with check (true);

-- El dueño no puede cambiarse «oculto» ni «me_gusta»: lo impide un trigger
create or replace function public.proteger_campos() returns trigger
language plpgsql as $$
begin
  new.dueno := old.dueno;
  if not public.es_admin() then
    new.oculto := old.oculto;
  end if;
  -- Profundidad 1 = UPDATE directo del cliente; el contador de me gusta
  -- actualiza desde otro trigger (profundidad 2) y sí puede cambiarlo.
  if pg_trigger_depth() = 1 then
    new.me_gusta := old.me_gusta;
  end if;
  return new;
end $$;
create trigger panoramas_proteger before update on public.panoramas
  for each row execute function public.proteger_campos();

-- Lectura por enlace directo (incluye «enlace», nunca «privada» ni ocultos)
create or replace function public.obtener_panorama(p_id uuid)
returns setof public.panoramas
language sql stable security definer set search_path = public as $$
  select * from panoramas
  where id = p_id and not oculto and visibilidad in ('enlace','publica');
$$;
grant execute on function public.obtener_panorama(uuid) to anon, authenticated;

-- me gusta: se ven los de panoramas visibles; cada quien da/quita el suyo
create policy me_gusta_leer on public.me_gusta for select using (
  exists (select 1 from panoramas p where p.id = panorama)   -- hereda RLS de panoramas
);
create policy me_gusta_dar on public.me_gusta for insert with check (
  usuario = auth.uid()
  and exists (select 1 from panoramas p where p.id = panorama and p.visibilidad = 'publica')
);
create policy me_gusta_quitar on public.me_gusta for delete using (usuario = auth.uid());

-- reportes: cualquiera con sesión reporta; solo administradores leen y cambian estado
create policy reportes_crear  on public.reportes for insert with check (autor = auth.uid());
create policy reportes_leer   on public.reportes for select using (public.es_admin());
create policy reportes_estado on public.reportes for update
  using (public.es_admin()) with check (public.es_admin());

-- ───────── Storage ─────────
-- Bucket «publicas» (lectura pública; rutas con uuid no adivinables) para «enlace» y «publica».
-- Bucket «privadas» (sin lectura pública; URL firmadas) para «privada».
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('publicas', 'publicas', true,  20971520, array['image/jpeg']),
       ('privadas', 'privadas', false, 20971520, array['image/jpeg'])
on conflict (id) do nothing;

create policy archivos_leer_publicas on storage.objects for select
  using (bucket_id = 'publicas');
create policy archivos_leer_privadas on storage.objects for select
  using (bucket_id = 'privadas' and (storage.foldername(name))[1] = auth.uid()::text);
create policy archivos_subir on storage.objects for insert
  with check (bucket_id in ('publicas','privadas')
              and (storage.foldername(name))[1] = auth.uid()::text);
create policy archivos_reemplazar on storage.objects for update
  using (bucket_id in ('publicas','privadas')
         and (storage.foldername(name))[1] = auth.uid()::text);
create policy archivos_borrar on storage.objects for delete
  using (bucket_id in ('publicas','privadas')
         and ((storage.foldername(name))[1] = auth.uid()::text or public.es_admin()));
```

> Nota: el trigger `proteger_campos` se afinará en la Fase 4 con una prueba SQL
> (pgTAP o script) para confirmar que el contador sigue funcionando y que el dueño
> no puede alterar `me_gusta`/`oculto`. Lo dejo marcado como punto a verificar.

**Eliminar cuenta**: Edge Function `eliminar-cuenta` (clave service role solo en el
servidor): borra los archivos `<uid>/…` de ambos buckets y luego
`auth.admin.deleteUser(uid)`; el `on delete cascade` elimina perfil, panoramas,
me gusta y reportes. La app además ofrece borrar los datos locales.

---

## 4. Riesgos técnicos y mitigación

Marco con ⚠️ lo que **no es viable tal cual** en el navegador y la alternativa que propongo.

### Captura

| Riesgo | Mitigación |
|---|---|
| ⚠️ `getUserMedia` entrega **fotogramas de video** (normalmente 1080p–4K), no la foto de 12–48 MP del sensor. iOS no tiene `ImageCapture.takePhoto()`. | Chrome Android: usar `ImageCapture.takePhoto()` cuando exista (resolución completa). iOS: fotograma de video a la máxima resolución que acepte. Con ~16–50 tomas, un 8K sigue siendo alcanzable; lo indico en pantalla si la resolución limita la salida. |
| El navegador **no informa el campo de visión** de la cámara. | Tabla de FOV típicos por lente (principal ≈ 65–70°, gran angular ≈ 100–110° en vertical/horizontal), más **auto‑calibración**: con las dos primeras tomas y su rotación medida, ORB estima el FOV real. La etapa B lo refina. |
| Elegir lente gran angular: en algunos Android y en iOS reciente `enumerateDevices()` expone varias cámaras traseras; en otros no. | Listar las cámaras traseras con su etiqueta; si solo hay una, ocultar la opción y explicar por qué. |
| ⚠️ Bloqueo de exposición/balance: solo Chrome Android en algunos equipos (`exposureMode`, `whiteBalanceMode`). **iOS no lo permite.** | Aplicarlo si `getCapabilities()` lo anuncia; si no, compensar exposición en la etapa B (ganancia por toma por mínimos cuadrados). |
| ⚠️ `navigator.vibrate` no existe en iOS. | Sonido (Web Audio) + destello visual en iOS; vibración en Android. |
| Orientación: en iOS `alpha` es relativo al inicio; en Android `deviceorientationabsolute` sufre saltos por el magnetómetro. | Solo importa la orientación **relativa** dentro de la sesión: usar `RelativeOrientationSensor` (cuaternión directo, Chrome) y en su defecto `deviceorientation` relativo. Bloqueo de cardán evitado con cuaterniones. |
| Permiso de sensores en iOS solo tras un toque. | Pantalla inicial con botón «Empezar» que pide cámara y `DeviceOrientationEvent.requestPermission()` en el mismo gesto. |
| **Paralaje**: girar el teléfono con el brazo no gira sobre el punto nodal → fantasmas en objetos cercanos. | Instrucciones visuales («gira el teléfono, no tu cuerpo»), aviso si el acelerómetro detecta traslación, mezcla suave y etapa B. Es una limitación física también de la app original. |
| Teléfono de cabeza (para el nadir). | El plan de tomas y la alineación trabajan con cuaterniones completos; la UI rota los textos según la gravedad. |

### Cosido

| Riesgo | Mitigación |
|---|---|
| ⚠️ Safari iOS limita un `<canvas>` a ~16,7 MP; un 8K equirectangular son 33,5 MP. | Componer en memoria (TypedArray) por franjas horizontales en el Worker y codificar con MozJPEG WASM (jSquash, Apache‑2.0). Sin canvas gigante. |
| Memoria: 8K RGBA = 134 MB; acumuladores flotantes de pesos multiplicarían eso. | Franjas de ~256 filas con acumuladores solo de la franja; las tomas se decodifican una a la vez y se reducen al tamaño útil. Ofrecer 8K solo si `navigator.deviceMemory ≥ 4` (Chrome) o tras una prueba de asignación (iOS no expone la memoria). |
| ⚠️ OpenCV.js oficial **no incluye el módulo `stitching`** (no hay `cv.Stitcher`). | Sí trae ORB, BFMatcher y `findHomography`. Propongo: emparejar ORB entre vecinas, convertir coincidencias a pares de rayos, y resolver **ajuste de haces solo de rotaciones** (3 parámetros por toma, Levenberg‑Marquardt) en TypeScript propio. La compensación de exposición también es código propio. |
| OpenCV.js pesa ~8–10 MB. | Descarga bajo demanda la primera vez que se usa la etapa B, con aviso de tamaño; queda en caché del Service Worker. La etapa A no lo necesita. |
| Zonas sin textura (cielo, techo blanco) sin coincidencias. | La rotación de esa toma queda anclada a la del sensor (término de regularización hacia la orientación medida). |

### Visor y exportación

| Riesgo | Mitigación |
|---|---|
| Tamaño máximo de textura WebGL (4096 en varios móviles). | Teselas generadas localmente + `EquirectangularTilesAdapter`. |
| ⚠️ **WebXR inmersivo no existe en Safari de iPhone.** | Chrome Android: WebXR `immersive-vr`. iOS: modo estéreo tipo Cardboard (plugin estéreo de PSV) con giroscopio. |
| Google Photos / Facebook deben reconocer el 360°. | Insertar segmento APP1 XMP con `GPano:ProjectionType=equirectangular`, `UsePanoramaViewer`, `FullPanoWidthPixels`/`Height`, `CroppedArea*`. Lo verifico con pruebas unitarias del binario y prueba real en ambos servicios. Facebook a veces también mira la marca/modelo EXIF: se documentará el resultado. |
| GPS en EXIF: privacidad. | Apagado por defecto; casilla explícita por captura. Al subir a la nube, la ubicación del mapa se redondea (p. ej. 4 decimales) salvo que el usuario elija precisión exacta. |
| En la PWA instalada de iOS «Descargar» abre una vista previa. | Usar Web Share con el archivo («Guardar imagen» / «Guardar en Archivos»). |

### Almacenamiento y sincronización

| Riesgo | Mitigación |
|---|---|
| Safari puede borrar datos de sitios no usados en 7 días (no aplica igual a PWA instalada). | `navigator.storage.persist()`, invitar a instalar, mostrar espacio con `storage.estimate()` y ofrecer exportar copia. |
| ⚠️ Background Sync no existe en Safari. | Cola en IndexedDB que se reintenta al abrir la app, al evento `online` y con retroceso exponencial mientras la app está abierta. |

### Servicios externos

| Riesgo | Mitigación |
|---|---|
| **Supabase gratis pausa el proyecto tras 7 días sin actividad** → los enlaces compartidos dejarían de funcionar. Además ~1 GB de archivos y ~5 GB de transferencia al mes (confirmar en la página oficial). | Subir por defecto versión 4K (~3–5 MB) + miniatura; 8K opcional. Un GitHub Action semanal que hace una consulta mínima para mantenerlo activo. Supabase es libre (Apache‑2.0) y se puede autoalojar si algún día crece. |
| ⚠️ Las teselas de `tile.openstreetmap.org` **prohíben uso intensivo y descarga para uso offline**. | MapLibre con **OpenFreeMap** (teselas vectoriales libres de OSM, sin clave) o un archivo PMTiles propio. Atribución a OpenStreetMap siempre visible. |
| Street View Publish API es un servicio cerrado de Google (choca con la preferencia de software libre); requiere proyecto en Google Cloud, pantalla de consentimiento OAuth y, sin verificación de Google, solo hasta 100 usuarios de prueba. Exige foto ≥ 7,5 MP 2:1 con GPS. | Detrás de una bandera apagada por defecto; OAuth con Google Identity Services (sin secreto en el cliente). Guía paso a paso en `docs/street-view.md`. No encontré aviso de retiro de la API, pero lo verifico antes de la Fase 5. |

### Efecto 3D (experimental)

| Riesgo | Mitigación |
|---|---|
| ⚠️ Un «mundo caminable» real no es viable: una sola foto no tiene información detrás de los objetos. | Paralaje limitado (desplazamientos de pocos centímetros) con estiramiento visible en bordes de profundidad; etiquetado «Experimental». |
| Depth Anything está entrenado con fotos planas; en equirectangular se deforma. | Inferir sobre las 6 caras de un cubo y unificar escala en las uniones. |
| Modelo de 25–100 MB según cuantización; lento sin GPU. | **Depth Anything V2 Small** (licencia Apache‑2.0; Base/Large son no comerciales, no se usan). WebGPU si existe (Chrome, Safari 26), WASM como respaldo con aviso de tiempo. Descarga bajo demanda y en caché. |

### Licencias (todas libres)

React, Vite, Tailwind, Workbox, idb, three, Photo Sphere Viewer, MapLibre (BSD),
OpenCV (Apache‑2.0), Transformers.js (Apache‑2.0), jSquash (Apache‑2.0),
Supabase (Apache‑2.0), Depth Anything V2 Small (Apache‑2.0). Sin analítica.

---

## 5. Plan de fases (espera confirmación entre cada una)

1. **Esqueleto PWA + visor + importar/exportar GPano** — biblioteca local, importar
   equirectangulares (validando 2:1), visor con giroscopio/zoom/pantalla completa,
   planeta pequeño, exportar encuadre plano, JPEG con XMP GPano (+ EXIF GPS
   opcional), Web Share, indicador de espacio y almacenamiento persistente.
   Pruebas: proyección, cuaterniones, escritura/lectura de segmentos XMP.
2. **Captura guiada** — plan de tomas por FOV, cámara, sensores, superposición de
   objetivos, guía con flecha, disparo automático, borradores, deshacer.
3. **Cosido** — etapa A (proyección + feathering + nadir), luego etapa B (ORB +
   rotaciones + exposición), selector 4K/8K, cancelación.
4. **Nube** — Supabase (SQL de arriba), enlace mágico, subir/cola, `ver.html`,
   iframe, Explorar, me gusta, mapa con grupos, perfil, reportes, eliminar cuenta.
5. **Street View (bandera), VR y efecto 3D**.

Prueba en teléfono real: la cámara y los sensores exigen HTTPS. Opciones:
`vite --host` con `@vitejs/plugin-basic-ssl` en la misma Wi‑Fi (aceptando el
certificado), o publicar una vista previa en GitHub Pages / Cloudflare Pages.

(() => {
  const root = document.querySelector('.section.is--vad-pro');
  const hero = root?.querySelector('.vad__hero-wrap');
  const highlight = root?.querySelector(':scope > .vad__hero-wrap > .highlight__wrapper');
  const cards = root?.querySelector(':scope > .cards__wrap');

  if (!root || !hero || (!highlight && !cards) || document.querySelector('.mbzoey-hero-below')) return;

  const below = document.createElement('section');
  below.className = 'mbzoey-hero-below';
  below.setAttribute('aria-label', 'Mbzoey 产品亮点');
  const belowBackdrop = document.createElement('div');
  belowBackdrop.className = 'mbzoey-scroll-backdrop mbzoey-scroll-backdrop--below';
  belowBackdrop.setAttribute('aria-hidden', 'true');
  below.appendChild(belowBackdrop);
  root.insertAdjacentElement('afterend', below);
  if (highlight) below.appendChild(highlight);
  if (cards) below.appendChild(cards);

  const interaction = document.createElement('div');
  interaction.className = 'mbzoey-shave-interaction';
  interaction.setAttribute('aria-label', '点击人脸即可剃须');
  interaction.innerHTML = `
    <canvas class="mbzoey-shave-canvas mbzoey-shave-base" aria-hidden="true"></canvas>
    <span class="mbzoey-layer-word mbzoey-layer-word--left" aria-hidden="true">MBZ</span>
    <span class="mbzoey-layer-word mbzoey-layer-word--right" aria-hidden="true">OEY</span>
    <canvas class="mbzoey-shave-canvas mbzoey-person-layer" aria-hidden="true"></canvas>
    <canvas class="mbzoey-shave-canvas mbzoey-shave-reveal" aria-hidden="true"></canvas>
    <img class="mbzoey-shaver-cursor" src="assets/mbzoey-shaver-cursor.webp" alt="" aria-hidden="true">
    <span class="mbzoey-shave-hint"><span class="mbzoey-shave-hint__inner">点击人脸即可剃须</span></span>
  `;
  hero.prepend(interaction);

  const baseCanvas = interaction.querySelector('.mbzoey-shave-base');
  const personCanvas = interaction.querySelector('.mbzoey-person-layer');
  const revealCanvas = interaction.querySelector('.mbzoey-shave-reveal');
  const cursor = interaction.querySelector('.mbzoey-shaver-cursor');
  cursor.decoding = 'async';
  cursor.fetchPriority = 'high';
  const hint = interaction.querySelector('.mbzoey-shave-hint');
  let hintPositionFrame = 0;
  let hintPositioned = false;
  let hintOverBeard = false;
  const updateHintPosition = (event, rect) => {
    const cursorWidth = Math.min(132, Math.max(64, rect.width * .09));
    const gap = Math.max(10, cursorWidth * .14);
    // offsetWidth stays stable while the inner label is collapsed, so edge
    // clamping never jumps when the mouse is moving quickly.
    const width = hint.offsetWidth;
    const preferredLeft = event.clientX - rect.left + cursorWidth * .5 + gap;
    const maxLeft = Math.max(16, rect.width - width - 16);
    const left = Math.min(preferredLeft, maxLeft);
    const top = Math.min(Math.max(event.clientY - rect.top, 20), rect.height - 20);
    hint.style.setProperty('--mbzoey-hint-left', `${Math.max(16, left)}px`);
    hint.style.setProperty('--mbzoey-hint-top', `${top}px`);
    if (!hintPositioned) {
      hintPositioned = true;
      hint.classList.add('is-positioning');
      window.cancelAnimationFrame(hintPositionFrame);
      hintPositionFrame = window.requestAnimationFrame(() => {
        hint.classList.remove('is-positioning');
      });
    }
    hint.classList.add('is-following');
  };

  const updateHintRegion = (insideBeard) => {
    if (hintOverBeard === insideBeard) return;
    hintOverBeard = insideBeard;
    hint.classList.toggle('is-over-beard', insideBeard);
  };

  // Start with the bearded portrait (图一) and reveal the clean portrait
  // (图二) through the feathered shave mask.
  const background = new Image();
  background.decoding = 'async';
  background.fetchPriority = 'high';
  const maskImage = new Image();
  const personRegionImage = new Image();
  personRegionImage.decoding = 'async';
  personRegionImage.fetchPriority = 'high';
  background.src = 'assets/mbzoey-beard-mask.webp';
  personRegionImage.src = 'assets/mbzoey-person-region-mask.png';
  let maskRequested = false;

  const ensureMaskImage = () => {
    if (!maskRequested) {
      maskRequested = true;
      maskImage.src = 'assets/mbzoey-beard-base.webp';
    }
    if (maskImage.complete) return Promise.resolve();
    return maskImage.decode?.() || new Promise((resolve) => {
      maskImage.addEventListener('load', resolve, {once: true});
    });
  };

  const state = {points: [], active: false, rect: null, scale: 1, offsetX: 0, offsetY: 0};
  let heroInView = true;
  const source = {width: 2304, height: 1728};
  const edgeCanvas = document.createElement('canvas');
  const edgeContext = edgeCanvas.getContext('2d');
  const personMaskCanvas = document.createElement('canvas');
  const personMaskContext = personMaskCanvas.getContext('2d');
  // Source-space polygon mapped from the user's red beard outline and inset
  // slightly. Keeping this as a small polygon prevents eye, forehead, nose,
  // outer-cheek, and neck hits that a broad rectangle would accept.
  const beardRegion = [
    {x: 1210, y: 558},
    {x: 1128, y: 566},
    {x: 1066, y: 632},
    {x: 1063, y: 707},
    {x: 1116, y: 806},
    {x: 1196, y: 813},
    {x: 1281, y: 768},
    {x: 1306, y: 713},
    {x: 1302, y: 657},
    {x: 1278, y: 590},
  ];
  const setupCanvas = (canvas, rect, dpr) => {
    const pixelWidth = Math.max(1, Math.round(rect.width * dpr));
    const pixelHeight = Math.max(1, Math.round(rect.height * dpr));
    // Changing canvas.width/height reallocates the backing store. Only do it
    // when the viewport or device pixel ratio actually changes; pointer moves
    // otherwise reuse the existing buffers and avoid input jank.
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    const cssWidth = `${rect.width}px`;
    const cssHeight = `${rect.height}px`;
    if (canvas.style.width !== cssWidth) canvas.style.width = cssWidth;
    if (canvas.style.height !== cssHeight) canvas.style.height = cssHeight;
    const context = canvas.getContext('2d');
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    return context;
  };

  let layoutWidth = 0;
  let layoutHeight = 0;
  const ensureImageLayout = (rect, force = false) => {
    if (force || rect.width !== layoutWidth || rect.height !== layoutHeight) {
      imageLayout(rect);
      layoutWidth = rect.width;
      layoutHeight = rect.height;
    }
  };

  const imageLayout = (rect) => {
    const coverScale = Math.max(rect.width / source.width, rect.height / source.height);
    const narrow = rect.width < 640;
    const zoom = narrow ? 1.2 : 1.3;
    state.scale = coverScale * zoom;
    const width = source.width * state.scale;
    const height = source.height * state.scale;
    state.offsetX = (rect.width - width) / 2;
    const centeredOffsetY = (rect.height - height) / 2;
    // Keep the top of the source hair below the unchanged navigation bar,
    // even on very wide screens where cover-cropping would otherwise lift it.
    const hairTopSourceY = narrow ? 155 : 180;
    const navBottom = document.querySelector('.centered-nav')?.getBoundingClientRect().bottom;
    const navClearance = (Number.isFinite(navBottom) ? navBottom : (narrow ? 86 : 110)) + 8;
    const clearanceShift = navClearance - hairTopSourceY * state.scale - centeredOffsetY;
    const baseShift = rect.height * (narrow ? 0.1 : 0.14);
    const minShift = narrow ? 48 : 80;
    const maxShift = narrow ? 140 : 720;
    const shiftY = Math.min(Math.max(baseShift, minShift, clearanceShift), maxShift);
    state.offsetY = centeredOffsetY + shiftY;
    // Keep the compositor fallback behind the canvases on the exact same
    // crop as drawCover(). This prevents a visible seam while the canvas is
    // decoding and when the canvases are moved by the parallax transform.
    interaction.style.setProperty('--mbzoey-image-size', `${width}px ${height}px`);
    interaction.style.setProperty('--mbzoey-image-left', `${state.offsetX}px`);
    interaction.style.setProperty('--mbzoey-image-top', `${state.offsetY}px`);
  };

  const pointToSource = (event) => {
    const rect = state.rect;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return {x: (x - state.offsetX) / state.scale, y: (y - state.offsetY) / state.scale};
  };

  const sourceToViewport = ({x, y}) => ({
    x: state.offsetX + x * state.scale,
    y: state.offsetY + y * state.scale,
  });

  const isInBeard = ({x, y}) => {
    let inside = false;
    for (let i = 0, j = beardRegion.length - 1; i < beardRegion.length; j = i++) {
      const current = beardRegion[i];
      const previous = beardRegion[j];
      const crosses = ((current.y > y) !== (previous.y > y)) &&
        x < ((previous.x - current.x) * (y - current.y)) /
          (previous.y - current.y) + current.x;
      if (crosses) inside = !inside;
    }
    return inside;
  };

  // The shaver belongs to the first screen only. A stationary pointer does not
  // emit pointerleave when the document scrolls underneath it, so visibility
  // must also follow the hero's viewport intersection instead of relying on
  // pointer events alone.
  const hideCursorOutsideHero = () => {
    state.active = false;
    interaction.classList.remove('is-shaving');
    interaction.classList.add('is-out-of-view');
    cursor.classList.remove('is-visible');
    hint.classList.remove('is-following', 'is-positioning', 'is-over-beard');
    if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    pendingPointer = null;
  };

  const setHeroVisibility = (visible) => {
    if (heroInView === visible) return;
    heroInView = visible;
    if (visible) interaction.classList.remove('is-out-of-view');
    else hideCursorOutsideHero();
  };

  const drawCover = (context, image, rect) => {
    context.clearRect(0, 0, rect.width, rect.height);
    context.drawImage(
      image,
      state.offsetX,
      state.offsetY,
      source.width * state.scale,
      source.height * state.scale,
    );
  };

  const drawPersonLayer = (context, rect, dpr) => {
    if (!personRegionImage.complete || !personRegionImage.naturalWidth) {
      context.clearRect(0, 0, rect.width, rect.height);
      return;
    }
    if (personMaskCanvas.width !== Math.round(rect.width * dpr) ||
        personMaskCanvas.height !== Math.round(rect.height * dpr)) {
      personMaskCanvas.width = Math.max(1, Math.round(rect.width * dpr));
      personMaskCanvas.height = Math.max(1, Math.round(rect.height * dpr));
    }
    personMaskContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    personMaskContext.filter = 'none';
    personMaskContext.clearRect(0, 0, rect.width, rect.height);
    personMaskContext.filter = `blur(${Math.max(2, 4 * state.scale) / dpr}px)`;
    personMaskContext.drawImage(
      personRegionImage,
      state.offsetX,
      state.offsetY,
      source.width * state.scale,
      source.height * state.scale,
    );
    personMaskContext.filter = 'none';
    context.globalCompositeOperation = 'destination-in';
    context.drawImage(personMaskCanvas, 0, 0, rect.width, rect.height);
    context.globalCompositeOperation = 'source-over';
  };

  const draw = () => {
    if (!state.rect || !background.complete || !background.naturalWidth) return;
    const dpr = window.devicePixelRatio || 1;
    const baseContext = setupCanvas(baseCanvas, state.rect, dpr);
    const personContext = setupCanvas(personCanvas, state.rect, dpr);
    const revealContext = setupCanvas(revealCanvas, state.rect, dpr);
    drawCover(baseContext, background, state.rect);
    drawCover(personContext, background, state.rect);
    drawPersonLayer(personContext, state.rect, dpr);

    // Keep the clean portrait canvas transparent until the first shave stroke.
    // This avoids a second full-size image draw during the initial page paint.
    if (!state.points.length) {
      revealContext.clearRect(0, 0, state.rect.width, state.rect.height);
      return;
    }

    if (!maskImage.complete) return;

    drawCover(revealContext, maskImage, state.rect);

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = revealCanvas.width;
    maskCanvas.height = revealCanvas.height;
    const maskContext = maskCanvas.getContext('2d');
    maskContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    maskContext.clearRect(0, 0, state.rect.width, state.rect.height);
    for (const point of state.points) {
      const viewportPoint = sourceToViewport(point);
      const x = viewportPoint.x;
      const y = viewportPoint.y;
      const radius = 88 * state.scale;
      const gradient = maskContext.createRadialGradient(x, y, radius * 0.18, x, y, radius);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.68, 'rgba(255,255,255,.88)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      maskContext.fillStyle = gradient;
      maskContext.beginPath();
      maskContext.arc(x, y, radius, 0, Math.PI * 2);
      maskContext.fill();
    }

    // Multiply the brush by a softly blurred beard shape. The hit test still
    // uses the sharp polygon, while the rendered edge fades into the portrait.
    if (edgeCanvas.width !== maskCanvas.width || edgeCanvas.height !== maskCanvas.height) {
      edgeCanvas.width = maskCanvas.width;
      edgeCanvas.height = maskCanvas.height;
    }
    edgeContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    edgeContext.filter = 'none';
    edgeContext.clearRect(0, 0, state.rect.width, state.rect.height);
    const feather = Math.max(6, Math.min(18, 18 * state.scale));
    edgeContext.filter = `blur(${feather / dpr}px)`;
    edgeContext.fillStyle = '#fff';
    edgeContext.beginPath();
    beardRegion.forEach((point, index) => {
      const viewportPoint = sourceToViewport(point);
      if (index === 0) edgeContext.moveTo(viewportPoint.x, viewportPoint.y);
      else edgeContext.lineTo(viewportPoint.x, viewportPoint.y);
    });
    edgeContext.closePath();
    edgeContext.fill();
    edgeContext.filter = 'none';
    maskContext.globalCompositeOperation = 'destination-in';
    maskContext.drawImage(edgeCanvas, 0, 0, state.rect.width, state.rect.height);
    maskContext.globalCompositeOperation = 'source-over';
    revealContext.globalCompositeOperation = 'destination-in';
    revealContext.drawImage(maskCanvas, 0, 0, state.rect.width, state.rect.height);
    revealContext.globalCompositeOperation = 'source-over';
  };

  let drawFrame = 0;
  const requestDraw = () => {
    if (drawFrame) return;
    drawFrame = window.requestAnimationFrame(() => {
      drawFrame = 0;
      draw();
    });
  };

  const applyPointer = (event) => {
    if (!heroInView) return;
    const rect = interaction.getBoundingClientRect();
    state.rect = rect;
    ensureImageLayout(rect);
    updateHintPosition(event, rect);
    cursor.style.left = `${event.clientX - rect.left}px`;
    cursor.style.top = `${event.clientY - rect.top}px`;
    cursor.classList.add('is-visible');
    const point = pointToSource(event);
    const insideBeard = isInBeard(point);
    updateHintRegion(insideBeard);
    if (state.active && insideBeard) {
      const previous = state.points[state.points.length - 1];
      if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 18) {
        state.points.push(point);
        ensureMaskImage().then(requestDraw);
        requestDraw();
      }
    }
  };

  let pointerFrame = 0;
  let pendingPointer = null;
  const updatePointer = (event) => {
    pendingPointer = {clientX: event.clientX, clientY: event.clientY};
    // Enter/down need an immediate response. Pointer moves are coalesced to
    // one update per frame so rapid input cannot trigger repeated layout reads
    // and canvas work in the same frame.
    if (event.type === 'pointerenter' || event.type === 'pointerdown') {
      if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
      pointerFrame = 0;
      const next = pendingPointer;
      pendingPointer = null;
      applyPointer(next);
      return;
    }
    if (pointerFrame) return;
    pointerFrame = window.requestAnimationFrame(() => {
      pointerFrame = 0;
      const next = pendingPointer;
      pendingPointer = null;
      if (next) applyPointer(next);
    });
  };

  const start = (event) => {
    if (!heroInView) return;
    event.preventDefault();
    state.active = true;
    interaction.setPointerCapture?.(event.pointerId);
    updatePointer(event);
    const point = pointToSource(event);
    if (isInBeard(point)) {
      state.points.push(point);
      ensureMaskImage().then(requestDraw);
      requestDraw();
    }
    interaction.classList.add('is-shaving');
  };

  const stop = () => {
    state.active = false;
    if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    pendingPointer = null;
    interaction.classList.remove('is-shaving');
    window.cancelAnimationFrame(hintPositionFrame);
    hintPositioned = false;
    hint.classList.remove('is-following', 'is-positioning');
  };

  const resize = () => {
    state.rect = interaction.getBoundingClientRect();
    ensureImageLayout(state.rect, true);
    draw();
  };

  // Scroll-scrubbed parallax: each background layer follows the section's
  // scroll progress with a small spring-like delay. The hero and the next
  // section keep their content in normal flow; only media layers drift.
  let scrollFrame = 0;
  const parallax = {
    belowBackdrop: 0,
    heroMedia: 0,
  };
  const clamp01 = (value) => Math.min(1, Math.max(0, value));
  const setParallax = (element, variable, value) => {
    if (element) element.style.setProperty(variable, `${value.toFixed(2)}px`);
  };

  const updateScrollBackdrops = () => {
    const viewportHeight = window.innerHeight || 1;
    const heroRect = hero.getBoundingClientRect();
    const belowRect = below.getBoundingClientRect();
    setHeroVisibility(heroRect.bottom > 0 && heroRect.top < viewportHeight);
    const heroProgress = clamp01(-heroRect.top / Math.max(1, heroRect.height));
    // Keep the next page's background moving while it enters the viewport,
    // so it arrives later than the page surface and creates the handoff seen
    // in the reference video.
    const belowProgress = clamp01(
      (viewportHeight - belowRect.top) /
        (viewportHeight + Math.max(1, belowRect.height)),
    );

    const targets = [
      {element: belowBackdrop, key: 'belowBackdrop', variable: '--mbzoey-parallax-y', value: belowProgress * 180},
    ];
    const mediaValue = heroProgress * 150;
    const mediaElements = [baseCanvas, personCanvas, revealCanvas];
    let moving = false;
    for (const {element, key, variable, value} of targets) {
      if (!element) continue;
      const next = parallax[key] + (value - parallax[key]) * 0.12;
      parallax[key] = next;
      setParallax(element, variable, next);
      if (Math.abs(value - next) > 0.25) moving = true;
    }
    const mediaNext = parallax.heroMedia + (mediaValue - parallax.heroMedia) * 0.12;
    parallax.heroMedia = mediaNext;
    // The CSS fallback background must follow the same delayed media shift as
    // the canvases; otherwise the two image layers separate while scrolling.
    setParallax(interaction, '--mbzoey-parallax-media-y', mediaNext);
    mediaElements.forEach((element) => {
      if (!element) return;
      setParallax(element, '--mbzoey-parallax-media-y', mediaNext);
    });
    if (Math.abs(mediaValue - mediaNext) > 0.25) moving = true;
    if (moving) scrollFrame = window.requestAnimationFrame(updateScrollBackdrops);
    else scrollFrame = 0;
  };

  const scheduleScrollBackdrop = () => {
    if (!scrollFrame) scrollFrame = window.requestAnimationFrame(updateScrollBackdrops);
  };

  interaction.addEventListener('pointermove', updatePointer, {passive: false});
  interaction.addEventListener('pointerdown', start, {passive: false});
  interaction.addEventListener('pointerup', stop);
  interaction.addEventListener('pointercancel', stop);
  interaction.addEventListener('pointerleave', stop);
  interaction.addEventListener('pointerenter', updatePointer, {passive: false});
  window.addEventListener('resize', () => {
    resize();
    scheduleScrollBackdrop();
  }, {passive: true});
  window.addEventListener('scroll', scheduleScrollBackdrop, {passive: true});
  let backgroundInitialized = false;
  const initializeBackground = () => {
    if (backgroundInitialized) return;
    backgroundInitialized = true;
    resize();
    scheduleScrollBackdrop();
  };
  background.addEventListener('load', initializeBackground, {once: true});
  background.addEventListener('error', () => interaction.classList.add('is-image-error'), {once: true});
  personRegionImage.addEventListener('load', requestDraw, {once: true});
  if (background.complete && background.naturalWidth) initializeBackground();
  else if (background.decode) background.decode().then(initializeBackground).catch(() => {});
  if (personRegionImage.complete && personRegionImage.naturalWidth) requestDraw();
})();

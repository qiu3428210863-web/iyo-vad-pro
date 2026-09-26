(() => {
  const root = document.querySelector('.section.is--vad-pro');
  const hero = root?.querySelector('.vad__hero-wrap');
  const highlight = root?.querySelector(':scope > .vad__hero-wrap > .highlight__wrapper');
  const cards = root?.querySelector(':scope > .cards__wrap');

  if (!root || !hero || (!highlight && !cards) || document.querySelector('.mbzoey-hero-below')) return;

  const below = document.createElement('section');
  below.className = 'mbzoey-hero-below';
  below.setAttribute('aria-label', 'Mbzoey 产品亮点');
  root.insertAdjacentElement('afterend', below);
  if (highlight) below.appendChild(highlight);
  if (cards) below.appendChild(cards);

  const interaction = document.createElement('div');
  interaction.className = 'mbzoey-shave-interaction';
  interaction.setAttribute('aria-label', '移动剃须刀体验剃须效果');
  interaction.innerHTML = `
    <canvas class="mbzoey-shave-canvas mbzoey-shave-base" aria-hidden="true"></canvas>
    <canvas class="mbzoey-shave-canvas mbzoey-shave-reveal" aria-hidden="true"></canvas>
    <img class="mbzoey-shaver-cursor" src="assets/mbzoey-shaver-cursor.png" alt="" aria-hidden="true">
    <span class="mbzoey-shave-hint"><span class="mbzoey-shave-hint__inner">移动剃须刀，点击或按住剃须</span></span>
  `;
  hero.prepend(interaction);

  const baseCanvas = interaction.querySelector('.mbzoey-shave-base');
  const revealCanvas = interaction.querySelector('.mbzoey-shave-reveal');
  const cursor = interaction.querySelector('.mbzoey-shaver-cursor');
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
  const maskImage = new Image();
  background.src = 'assets/mbzoey-beard-mask.png';
  let maskRequested = false;

  const ensureMaskImage = () => {
    if (!maskRequested) {
      maskRequested = true;
      maskImage.src = 'assets/mbzoey-beard-base.png';
    }
    if (maskImage.complete) return Promise.resolve();
    return maskImage.decode?.() || new Promise((resolve) => {
      maskImage.addEventListener('load', resolve, {once: true});
    });
  };

  const state = {points: [], active: false, rect: null, scale: 1, offsetX: 0, offsetY: 0};
  const source = {width: 2304, height: 1728};
  const edgeCanvas = document.createElement('canvas');
  const edgeContext = edgeCanvas.getContext('2d');
  // Source-space polygon that follows the moustache, jaw, and chin. Keeping
  // this as a polygon prevents eye, forehead, and outer-cheek hits that a
  // rectangular region would accept.
  const beardRegion = [
    {x: 1000, y: 565},
    {x: 1040, y: 540},
    {x: 1100, y: 540},
    {x: 1150, y: 552},
    {x: 1200, y: 540},
    {x: 1280, y: 545},
    {x: 1330, y: 575},
    {x: 1340, y: 640},
    {x: 1330, y: 710},
    {x: 1300, y: 780},
    {x: 1240, y: 835},
    {x: 1170, y: 865},
    {x: 1100, y: 845},
    {x: 1045, y: 805},
    {x: 1010, y: 750},
    {x: 990, y: 680},
    {x: 995, y: 620},
  ];

  const setupCanvas = (canvas, rect, dpr) => {
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const context = canvas.getContext('2d');
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    return context;
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
    const navClearance = narrow ? 96 : 118;
    const clearanceShift = navClearance - hairTopSourceY * state.scale - centeredOffsetY;
    const baseShift = rect.height * (narrow ? 0.1 : 0.14);
    const minShift = narrow ? 48 : 80;
    const maxShift = narrow ? 140 : 720;
    const shiftY = Math.min(Math.max(baseShift, minShift, clearanceShift), maxShift);
    state.offsetY = centeredOffsetY + shiftY;
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

  const draw = () => {
    if (!state.rect || !background.complete) return;
    const dpr = window.devicePixelRatio || 1;
    const baseContext = setupCanvas(baseCanvas, state.rect, dpr);
    const revealContext = setupCanvas(revealCanvas, state.rect, dpr);
    drawCover(baseContext, background, state.rect);

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
      const radius = 112 * state.scale;
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

  const updatePointer = (event) => {
    const rect = interaction.getBoundingClientRect();
    state.rect = rect;
    imageLayout(rect);
    updateHintPosition(event, rect);
    cursor.style.left = `${event.clientX - rect.left}px`;
    cursor.style.top = `${event.clientY - rect.top}px`;
    cursor.classList.add('is-visible');
    const point = pointToSource(event);
    const insideBeard = isInBeard(point);
    updateHintRegion(insideBeard);
    if (state.active) {
      if (insideBeard) {
        const previous = state.points[state.points.length - 1];
        if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 18) {
          state.points.push(point);
          ensureMaskImage().then(draw);
          draw();
        }
      }
    }
  };

  const start = (event) => {
    event.preventDefault();
    state.active = true;
    interaction.setPointerCapture?.(event.pointerId);
    updatePointer(event);
    const point = pointToSource(event);
    if (isInBeard(point)) {
      state.points.push(point);
      ensureMaskImage().then(draw);
      draw();
    }
    interaction.classList.add('is-shaving');
  };

  const stop = () => {
    state.active = false;
    interaction.classList.remove('is-shaving');
    window.cancelAnimationFrame(hintPositionFrame);
    hintPositioned = false;
    hint.classList.remove('is-following', 'is-positioning');
  };

  const resize = () => {
    state.rect = interaction.getBoundingClientRect();
    imageLayout(state.rect);
    draw();
  };

  interaction.addEventListener('pointermove', updatePointer, {passive: false});
  interaction.addEventListener('pointerdown', start, {passive: false});
  interaction.addEventListener('pointerup', stop);
  interaction.addEventListener('pointercancel', stop);
  interaction.addEventListener('pointerleave', stop);
  interaction.addEventListener('pointerenter', updatePointer, {passive: false});
  window.addEventListener('resize', resize, {passive: true});
  (background.decode?.() || Promise.resolve()).then(resize);
})();

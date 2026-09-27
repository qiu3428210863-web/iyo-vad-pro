(function () {
  'use strict';

  var STORAGE_KEY = 'mbzoey-cart-quantity';
  var MAX_QUANTITY = 99;
  var AMAZON_URL = 'https://www.amazon.com/dp/B0F62R84FS';

  function getElements() {
    return {
      panel: document.querySelector('[data-navigation-panel="cart"]'),
      item: document.querySelector('[sf-cart-item]'),
      empty: document.querySelector('[sf-cart-empty]'),
      count: document.querySelector('[sf-cart-count]'),
      input: document.querySelector('[sf-change-quantity]'),
      total: document.querySelector('[sf-cart-total]'),
      subtotal: document.querySelector('[sf-cart-subtotal]'),
      checkout: document.querySelector('[sf-checkout]'),
      image: document.querySelector('[sf-show-image]')
    };
  }

  function readQuantity() {
    try {
      var stored = Number.parseInt(window.localStorage.getItem(STORAGE_KEY), 10);
      if (Number.isFinite(stored)) return Math.max(0, Math.min(MAX_QUANTITY, stored));
    } catch (_) {
      // Storage can be unavailable in private browsing. The in-memory fallback still works.
    }
    // The page contains one configured Mbzoey product line. Treat it as the initial cart item
    // so the existing product card is immediately usable instead of showing conflicting states.
    return 1;
  }

  function writeQuantity(quantity) {
    try {
      if (quantity > 0) window.localStorage.setItem(STORAGE_KEY, String(quantity));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch (_) {
      // Keep the current quantity in memory when storage is blocked.
    }
  }

  function clampQuantity(value) {
    var quantity = Number.parseInt(value, 10);
    if (!Number.isFinite(quantity)) quantity = 1;
    return Math.max(0, Math.min(MAX_QUANTITY, quantity));
  }

  function updateCart(quantity, elements) {
    var next = clampQuantity(quantity);
    writeQuantity(next);

    if (elements.item) {
      elements.item.style.display = next > 0 ? '' : 'none';
      elements.item.setAttribute('aria-hidden', next > 0 ? 'false' : 'true');
    }
    if (elements.empty) {
      elements.empty.style.display = next > 0 ? 'none' : 'flex';
      elements.empty.setAttribute('aria-hidden', next > 0 ? 'true' : 'false');
    }
    if (elements.count) {
      elements.count.textContent = String(next);
      elements.count.setAttribute('aria-label', '购物车 ' + next + ' 件商品');
    }
    if (elements.input) {
      elements.input.value = String(Math.max(1, next));
      elements.input.setAttribute('aria-label', '商品数量');
    }
    // The product price is intentionally kept at $0 because this landing page does not expose
    // a verified price. The quantity and line state remain fully interactive.
    if (elements.total) elements.total.textContent = '$0';
    if (elements.subtotal) elements.subtotal.textContent = '$0';
  }

  function openAmazon(elements) {
    if (!elements || !elements.panel) return;
    window.open(AMAZON_URL, '_blank', 'noopener,noreferrer');
  }

  function init() {
    var elements = getElements();
    if (!elements.panel || !elements.item) return;

    if (elements.image) {
      elements.image.style.backgroundImage = 'url("assets/mbzoey-shaver-cursor.webp")';
      elements.image.style.backgroundSize = 'contain';
      elements.image.style.backgroundPosition = 'center';
    }

    var quantity = readQuantity();
    updateCart(quantity, elements);

    document.addEventListener('click', function (event) {
      var target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      var increase = target.closest('[sf-change-quantity-inc]');
      var decrease = target.closest('[sf-change-quantity-dec]');
      var remove = target.closest('[sf-cart-item-remove]');
      var checkout = target.closest('[sf-checkout]');
      var add = target.closest('[sf-add-to-cart], [data-mbzoey-add-to-cart]');

      if (increase || decrease || remove || checkout || add) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (increase) {
        quantity = Math.min(MAX_QUANTITY, quantity + 1);
        updateCart(quantity, elements);
      } else if (decrease) {
        quantity = Math.max(0, quantity - 1);
        updateCart(quantity, elements);
      } else if (remove) {
        quantity = 0;
        updateCart(quantity, elements);
      } else if (add) {
        quantity = Math.min(MAX_QUANTITY, quantity + 1);
        updateCart(quantity, elements);
      } else if (checkout) {
        if (quantity > 0) openAmazon(elements);
      }
    }, true);

    if (elements.input) {
      elements.input.addEventListener('input', function () {
        quantity = clampQuantity(elements.input.value);
        updateCart(quantity, elements);
      });
      elements.input.addEventListener('change', function () {
        quantity = clampQuantity(elements.input.value);
        updateCart(quantity, elements);
      });
    }

    window.MbzoeyCart = {
      getQuantity: function () { return quantity; },
      setQuantity: function (value) {
        quantity = clampQuantity(value);
        updateCart(quantity, elements);
      }
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}());

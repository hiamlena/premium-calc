(function () {
  "use strict";

  // ===== Настройки =====
  const ALLOWED_ORIGIN = "https://agrovendor.ru"; // Доверенный домен
  const MESSAGE_TYPE_HEIGHT = "tt-calc:height";
  const MESSAGE_TYPE_PING = "tt-host:ping";

  /**
   * Проверяет, разрешён ли источник сообщения
   * @param {string} origin
   * @returns {boolean}
   */
  function isAllowed(origin) {
    return origin === ALLOWED_ORIGIN;
  }

  /**
   * Привязывает автоматическую подстройку высоты iframe
   * @param {HTMLIFrameElement} iframe
   */
  function bindAutoHeight(iframe) {
    if (!iframe) {
      console.warn("TT_IFRAME_HOST: iframe не передан в bindAutoHeight");
      return;
    }

    /**
     * Устанавливает высоту iframe
     * @param {number|string} h
     */
    function setHeight(h) {
      const height = Number(h);
      if (!Number.isFinite(height) || height < 120) {
        return; // Игнорируем некорректные значения
      }
      iframe.style.height = `${Math.ceil(height)}px`;
    }

    /**
     * Отправляет ping-сообщение iframe для проверки связи
     */
    function ping() {
      try {
        iframe.contentWindow.postMessage({ type: MESSAGE_TYPE_PING }, ALLOWED_ORIGIN);
      } catch (error) {
        console.warn(`TT_IFRAME_HOST: Не удалось отправить ping в iframe (${iframe.src})`, error);
      }
    }

    // Обработчик входящих сообщений
    function handleMessage(event) {
      // Проверка источника
      if (!isAllowed(event.origin)) {
        console.debug("TT_IFRAME_HOST: Игнорируем сообщение из неразрешённого источника", event.origin);
        return;
      }

      const data = event.data;

      // Проверка структуры сообщения
      if (!data || typeof data !== "object") {
        return;
      }

      // Обработка события изменения высоты
      if (data.type === MESSAGE_TYPE_HEIGHT) {
        setHeight(data.height);
      }
    }

    // Привязка обработчика сообщений
    window.addEventListener("message", handleMessage);

    // Отправка ping при загрузке и сразу
    iframe.addEventListener("load", ping);
    ping();

    // Экспорт для ручного вызова (если потребуется)
    iframe._tt_ping = ping;
  }

  // Экспорт API
  if (typeof window.TT_IFRAME_HOST === "undefined") {
    window.TT_IFRAME_HOST = { bindAutoHeight };
  } else {
    console.warn("TT_IFRAME_HOST уже определён. Возможен конфликт скриптов.");
  }
})();

const GTM_URL = "https://www.googletagmanager.com/gtag/js";

const gtag = (...args) => {
  if (typeof window !== "undefined") {
    if (typeof window.gtag === "undefined") {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function gtag() {
        window.dataLayer.push(arguments);
      };
    }

    window.gtag(...args);
  }
};

function toTitleCase(str) {
  return str.replace(/\w\S*/g, function (txt) {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
}

function redactEmail(email) {
  return email;
}

function format(s = "", titleCase = true, redactingEmail = true) {
  let _str = s || "";

  if (titleCase) {
    _str = toTitleCase(s);
  }

  if (redactingEmail) {
    _str = redactEmail(_str);
  }

  return _str;
}

class GA4 {
  constructor() {
    this.reset();
  }

  reset = () => {
    this.isInitialized = false;
    this._testMode = false;
    this._currentMeasurementId = "";
    this._hasLoadedGA = false;
    this._isQueuing = false;
    this._queueGtag = [];
  };

  _gtag = (...args) => {
    if (!this._testMode) {
      if (this._isQueuing) {
        this._queueGtag.push(args);
      } else {
        gtag(...args);
      }
    } else {
      this._queueGtag.push(args);
    }
  };

  mergeOptions = (...options) => {
    return options.reduce((mergedOptions, option) => ({
      ...mergedOptions,
      ...this._toGtagOptions(option),
    }), {});
  };

  _loadGA = (GA_MEASUREMENT_ID, nonce) => {
    if (
      typeof window === "undefined" ||
      typeof document === "undefined" ||
      this._hasLoadedGA
    ) {
      return;
    }

    document.addEventListener("DOMContentLoaded", () => {
      const script = document.createElement("script");
      script.async = true;
      script.src = `${GTM_URL}?id=${GA_MEASUREMENT_ID}`;
      if (nonce) {
        script.setAttribute("nonce", nonce);
      }
      document.body.appendChild(script);
    });

    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };

    this._hasLoadedGA = true;
  };

  _toGtagOptions = (gaOptions) => {
    if (!gaOptions) {
      return;
    }

    const mapFields = {
      cookieUpdate: "cookie_update",
      cookieExpires: "cookie_expires",
      cookieDomain: "cookie_domain",
      cookieFlags: "cookie_flags",
      userId: "user_id",
      clientId: "client_id",
      anonymizeIp: "anonymize_ip",
      contentGroup1: "content_group1",
      contentGroup2: "content_group2",
      contentGroup3: "content_group3",
      contentGroup4: "content_group4",
      contentGroup5: "content_group5",
      allowAdFeatures: "allow_google_signals",
      allowAdPersonalizationSignals: "allow_ad_personalization_signals",
      nonInteraction: "non_interaction",
      page: "page_path",
      hitCallback: "event_callback",
    };

    const gtagOptions = Object.entries(gaOptions).reduce(
      (prev, [key, value]) => {
        prev[mapFields[key] || key] = value;
        return prev;
      },
      {}
    );

    return gtagOptions;
  };

  initialize = (GA_MEASUREMENT_ID, options = {}) => {
    if (!GA_MEASUREMENT_ID) {
      throw new Error("Require GA_MEASUREMENT_ID");
    }

    const initConfigs = Array.isArray(GA_MEASUREMENT_ID)
      ? GA_MEASUREMENT_ID
      : [{ trackingId: GA_MEASUREMENT_ID }];

    this._currentMeasurementId = initConfigs[0].trackingId;
    const {
      gaOptions,
      gtagOptions,
      nonce,
      testMode = false,
      gtagUrl,
    } = options;
    this._testMode = testMode;

    if (!testMode) {
      this._loadGA(this._currentMeasurementId, nonce);
    }
    if (!this.isInitialized) {
      this._gtag("js", new Date());

      initConfigs.forEach((config) => {
        const mergedGtagOptions = this.mergeOptions(gaOptions, config.gaOptions, gtagOptions, config.gtagOptions);
        if (Object.keys(mergedGtagOptions).length) {
          this._gtag("config", config.trackingId, mergedGtagOptions);
        } else {
          this._gtag("config", config.trackingId);
        }
      });
    }
    this.isInitialized = true;

    if (!testMode) {
      const queues = [...this._queueGtag];
      this._queueGtag = [];
      this._isQueuing = false;
      while (queues.length) {
        const queue = queues.shift();
        this._gtag(...queue);
        if (queue[0] === "get") {
          this._isQueuing = true;
        }
      }
    }
  };

  set = (fieldsObject) => {
    if (!fieldsObject) {
      console.warn("`fieldsObject` is required in .set()");
      return;
    }

    if (typeof fieldsObject !== "object") {
      console.warn("Expected `fieldsObject` arg to be an Object");
      return;
    }

    if (Object.keys(fieldsObject).length === 0) {
      console.warn("empty `fieldsObject` given to .set()");
    }

    this._gaCommand("set", fieldsObject);
  };

  _gaCommandSendEvent = (
    eventCategory,
    eventAction,
    eventLabel,
    eventValue,
    fieldsObject
  ) => {
    this._gtag("event", eventAction, {
      event_category: eventCategory,
      event_label: eventLabel,
      value: eventValue,
      ...(fieldsObject && { non_interaction: fieldsObject.nonInteraction }),
      ...this._toGtagOptions(fieldsObject),
    });
  };

  _gaCommandSendEventParameters = ({ eventCategory, eventAction, eventLabel, eventValue, ...rest }) => {
    this._gaCommandSendEvent(eventCategory, eventAction, eventLabel, eventValue, rest);
  };

  _gaCommandSendTiming = (
    timingCategory,
    timingVar,
    timingValue,
    timingLabel
  ) => {
    this._gtag("event", "timing_complete", {
      name: timingVar,
      value: timingValue,
      event_category: timingCategory,
      event_label: timingLabel,
    });
  };

  _gaCommandSendPageview = (page, fieldsObject) => {
    if (fieldsObject && Object.keys(fieldsObject).length) {
      const { title, location, ...rest } = this._toGtagOptions(fieldsObject);

      this._gtag("event", "page_view", {
        ...(page && { page_path: page }),
        ...(title && { page_title: title }),
        ...(location && { page_location: location }),
        ...rest,
      });
    } else if (page) {
      this._gtag("event", "page_view", { page_path: page });
    } else {
      this._gtag("event", "page_view");
    }
  };

  _gaCommandSendPageviewParameters = (...args) => {
    if (typeof args[0] === "string") {
      this._gaCommandSendPageview(...args.slice(1));
    } else {
      const {
        page,
        // eslint-disable-next-line no-unused-vars
        hitType,
        ...rest
      } = args[0];
      this._gaCommandSendPageview(page, rest);
    }
  };

  _gaCommandSend = (...args) => {
    const hitType = typeof args[0] === "string" ? args[0] : args[0].hitType;

    switch (hitType) {
      case "event":
        this._gaCommandSendEventParameters(...args);
        break;
      case "pageview":
        this._gaCommandSendPageviewParameters(...args);
        break;
      case "timing":
        this._gaCommandSendTiming(...args.slice(1));
        break;
      case "screenview":
      case "transaction":
      case "item":
      case "social":
      case "exception":
        console.warn(`Unsupported send command: ${hitType}`);
        break;
      default:
        console.warn(`Send command doesn't exist: ${hitType}`);
    }
  };

  _gaCommandSet = (...args) => {
    if (typeof args[0] === "string") {
      args[0] = { [args[0]]: args[1] };
    }
    this._gtag("set", this._toGtagOptions(args[0]));
  };

  _gaCommand = (command, ...args) => {
    switch (command) {
      case "send":
        this._gaCommandSend(...args);
        break;
      case "set":
        this._gaCommandSet(...args);
        break;
      default:
        console.warn(`Command doesn't exist: ${command}`);
    }
  };

  ga = (...args) => {
    if (typeof args[0] === "string") {
      this._gaCommand(...args);
    } else {
      const [readyCallback] = args;
      this._gtag("get", this._currentMeasurementId, "client_id", (clientId) => {
        this._isQueuing = false;
        const queues = this._queueGtag;

        readyCallback({
          get: (property) =>
            property === "clientId"
              ? clientId
              : property === "trackingId"
              ? this._currentMeasurementId
              : property === "apiVersion"
              ? "1"
              : undefined,
        });

        while (queues.length) {
          const queue = queues.shift();
          this._gtag(...queue);
        }
      });

      this._isQueuing = true;
    }

    return this.ga;
  };

  event = (optionsOrName, params) => {
    if (typeof optionsOrName === "string") {
      this._gtag("event", optionsOrName, this._toGtagOptions(params));
    } else {
      const { action, category, label, value, nonInteraction, transport } =
        optionsOrName;
      if (!category || !action) {
        console.warn("args.category AND args.action are required in event()");

        return;
      }

      // Required Fields
      const fieldObject = {
        hitType: "event",
        eventCategory: format(category),
        eventAction: format(action),
      };

      // Optional Fields
      if (label) {
        fieldObject.eventLabel = format(label);
      }

      if (typeof value !== "undefined") {
        if (typeof value !== "number") {
          console.warn("Expected `args.value` arg to be a Number.");
        } else {
          fieldObject.eventValue = value;
        }
      }

      if (typeof nonInteraction !== "undefined") {
        if (typeof nonInteraction !== "boolean") {
          console.warn("`args.nonInteraction` must be a boolean.");
        } else {
          fieldObject.nonInteraction = nonInteraction;
        }
      }

      if (typeof transport !== "undefined") {
        if (typeof transport !== "string") {
          console.warn("`args.transport` must be a string.");
        } else {
          if (["beacon", "xhr", "image"].indexOf(transport) === -1) {
            console.warn(
              "`args.transport` must be either one of these values: `beacon`, `xhr` or `image`"
            );
          }

          fieldObject.transport = transport;
        }
      }

      this._gaCommand("send", fieldObject);
    }
  };

  send = (fieldObject) => {
    this._gaCommand("send", fieldObject);
  };

  static createInstance() {
    return new GA4();
  }
}

const ga4Instance = GA4.createInstance();

const pageEvent = (page, title = "") => {
    ga4Instance.send({ hitType: "pageview", page: page, title: title });
}

const clickBannerEvent = () => {
  ga4Instance.event({
    category: 'Banner',
    action: 'Click Banner'
  })
}
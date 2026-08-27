let celebrationTimeline;
let introTimers = [];
let replayListenerAdded = false;
let giftFormListenerAdded = false;
let customization = {};
let progressFrame;
let progressElapsed = 0;
let progressTotal = 0;
let progressLastTimestamp;
let progressRunning = false;
let phoneSceneActive = false;

// The phone scene is driven by the two delays below: 3 seconds before closing,
// followed by 700ms for the closing transition.
const PHONE_SCENE_DURATION_MS = 3700;

const updateProgress = value => {
  const progress = Math.max(0, Math.min(100, value));
  const fill = document.querySelector('.experience-progress-fill');
  const bar = document.querySelector('.experience-progress');
  if (fill) fill.style.transform = `scaleX(${progress / 100})`;
  if (bar) bar.setAttribute('aria-valuenow', progress.toFixed(1));
};

const runProgressClock = timestamp => {
  if (!progressRunning) return;
  if (progressLastTimestamp !== undefined && (!celebrationTimeline?.paused() || phoneSceneActive)) {
    progressElapsed += timestamp - progressLastTimestamp;
  }
  progressLastTimestamp = timestamp;
  updateProgress(progressTotal ? progressElapsed / progressTotal * 100 : 0);
  progressFrame = requestAnimationFrame(runProgressClock);
};

const startProgress = () => {
  if (progressFrame) cancelAnimationFrame(progressFrame);
  progressElapsed = 0;
  progressTotal = 0;
  progressLastTimestamp = undefined;
  progressRunning = true;
  updateProgress(0);
  progressFrame = requestAnimationFrame(runProgressClock);
};

const finishProgress = () => {
  progressRunning = false;
  if (progressFrame) cancelAnimationFrame(progressFrame);
  progressElapsed = progressTotal;
  updateProgress(100);
};

// Load all custom content before any animation begins.
const fetchData = async () => {
  try {
    const response = await fetch("customize.json");
    if (!response.ok) throw new Error(`Could not load customize.json (${response.status})`);

    const data = await response.json();
    customization = data;
    Object.entries(data).forEach(([key, value]) => {
      if (value === "") return;

      document.querySelectorAll(`[data-node-name="${key}"]`).forEach(el => {
        if (key === "imagePath") {
          el.setAttribute("src", value);
        } else {
          el.textContent = value;
        }
      });
    });
  } catch (err) {
    console.error("Error loading customize.json; using the page defaults:", err);
  }
};

const clearIntroTimers = () => {
  introTimers.forEach(clearTimeout);
  introTimers = [];
};

const schedule = (callback, delay) => {
  introTimers.push(setTimeout(callback, delay));
};

const resetExperience = () => {
  const phoneFrame = document.querySelector('.phone-frame');
  const fullscreenMessage = document.getElementById('fullscreenMessage');
  const container = document.querySelector('.container');
  const messageClips = document.querySelectorAll('.message-clip');

  phoneSceneActive = false;
  startProgress();
  clearIntroTimers();
  if (celebrationTimeline) celebrationTimeline.pause(0);

  phoneFrame.style.display = 'none';
  phoneFrame.classList.remove('intro-active');
  phoneFrame.classList.remove('close-phone');
  fullscreenMessage.classList.remove('show');
  fullscreenMessage.style.display = '';
  container.style.display = 'block';
  container.style.visibility = 'hidden';

  messageClips.forEach(clip => {
    clip.style.animation = 'none';
    clip.offsetHeight; // Force the browser to apply the reset before replaying animation.
    clip.style.opacity = '';
    clip.style.transform = '';
  });
};

const playPhoneScene = onComplete => {
  const phoneFrame = document.querySelector('.phone-frame');
  const fullscreenMessage = document.getElementById('fullscreenMessage');
  const container = document.querySelector('.container');
  const messageClips = document.querySelectorAll('.message-clip');

  phoneFrame.style.display = '';
  phoneFrame.classList.add('intro-active');
  phoneSceneActive = true;

  // Reveal one chat message at a time.
  messageClips.forEach((clip, index) => {
    const delay = index * 2000;
    schedule(() => {
      clip.style.animation = `slideInUp 0.5s ease-out forwards`;
    }, delay);
  });
  
  // Keep the single birthday message on screen, then close the phone.
  schedule(() => {
    phoneFrame.classList.add('close-phone');
    schedule(() => {
      phoneFrame.style.display = 'none';
      phoneFrame.classList.remove('intro-active');
      phoneSceneActive = false;
      onComplete();
    }, 700);
  }, 3000);
};

const startAnimation = () => {
  resetExperience();
  animationTimeline();
};

const setupGiftForm = () => {
  const form = document.getElementById('giftForm');
  const status = document.getElementById('giftStatus');
  if (!form || giftFormListenerAdded) return;

  giftFormListenerAdded = true;
  form.addEventListener('submit', event => {
    event.preventDefault();
    const formData = new FormData(form);
    const choice = formData.get('giftChoice');
    const selectedOption = form.querySelector('input[name="giftChoice"]:checked');
    if (!choice) {
      status.textContent = 'Please choose one gift option.';
      return;
    }

    const request = [
      'Birthday gift request', '',
      `Choice: ${choice}`,
      `Product link: ${formData.get('productLink') || 'Not provided'}`,
      `Delivery address: ${formData.get('address')}`
    ].join('\n');
    const googleFormAction = customization.googleFormAction;
    const googleFields = customization.googleFormFields || {};
    const hasGoogleFormMapping = googleFormAction && googleFields[selectedOption.dataset.category] && googleFields.productLink && googleFields.address;

    if (hasGoogleFormMapping) {
      const googleForm = document.createElement('form');
      googleForm.method = 'POST';
      googleForm.action = googleFormAction;
      googleForm.target = 'giftFormResponse';
      googleForm.hidden = true;

      const addGoogleField = (name, value) => {
        const input = document.createElement('input');
        input.name = name;
        input.value = value;
        googleForm.appendChild(input);
      };

      addGoogleField(googleFields[selectedOption.dataset.category], choice);
      // Keep this empty when no link is provided, so Google Forms URL validation passes.
      addGoogleField(googleFields.productLink, formData.get('productLink') || '');
      addGoogleField(googleFields.address, formData.get('address'));

      let responseFrame = document.getElementById('giftFormResponse');
      if (!responseFrame) {
        responseFrame = document.createElement('iframe');
        responseFrame.id = 'giftFormResponse';
        responseFrame.name = 'giftFormResponse';
        responseFrame.hidden = true;
        document.body.appendChild(responseFrame);
      }

      document.body.appendChild(googleForm);
      googleForm.submit();
      googleForm.remove();
      status.textContent = 'Your gift request has been sent. Thank you!';
      form.reset();
      return;
    }

    const recipient = customization.giftRecipientEmail;

    if (recipient) {
      window.location.href = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent('Birthday gift choices')}&body=${encodeURIComponent(request)}`;
      status.textContent = 'Your email app is opening with the gift request.';
    } else {
      navigator.clipboard?.writeText(request);
      status.textContent = 'Request copied. Add Google Form mapping or giftRecipientEmail in customize.json to send it.';
    }
  });
};

// Animation Timeline (original animation)
const animationTimeline = () => {
  // Split chars that needs to be animated individually
  const textBoxChars = document.getElementsByClassName("hbd-chatbox")[0];
  const hbd = document.getElementsByClassName("wish-hbd")[0];

  const splitIntoCharacterSpans = element => {
    if (!element) return;
    if (!element.dataset.animationText) element.dataset.animationText = element.textContent;
    element.innerHTML = `<span>${element.dataset.animationText
      .split("")
      .join("</span><span>")}</span>`;
  };

  splitIntoCharacterSpans(textBoxChars);
  splitIntoCharacterSpans(hbd);

  const ideaTextTrans = {
    opacity: 0,
    y: -20,
    rotationX: 5,
    skewX: "15deg"
  };

  const ideaTextTransLeave = {
    opacity: 0,
    y: 20,
    rotationY: 5,
    skewX: "-15deg"
  };

  celebrationTimeline = new TimelineMax();
  const tl = celebrationTimeline;

  tl
    .to(".container", 0.1, {
      visibility: "visible"
    })
    .from(".one", 0.7, {
      opacity: 0,
      y: 10
    })
    .from(".two", 0.4, {
      opacity: 0,
      y: 10
    })
    .to(
      ".one",
      0.7,
      {
        opacity: 0,
        y: 10
      },
      "+=2.5"
    )
    .to(
      ".two",
      0.7,
      {
        opacity: 0,
        y: 10
      },
      "-=1"
    )
    .from(".three", 0.7, {
      opacity: 0,
      y: 10
    })
    .to(
      ".three",
      0.7,
      {
        opacity: 0,
        y: 10
      },
      "+=2"
    )
    .call(() => {
      playPhoneScene(() => tl.play());
    })
    .addPause()
    .from(".idea-1", 0.7, ideaTextTrans)
    .to(".idea-1", 0.7, ideaTextTransLeave, "+=1.5")
    .from(".idea-2", 0.7, ideaTextTrans)
    .to(".idea-2", 0.7, ideaTextTransLeave, "+=1.5")
    .from(".idea-3", 0.7, ideaTextTrans)
    .to(".idea-3 strong", 0.5, {
      scale: 1.2,
      x: 10,
      backgroundColor: "rgb(21, 161, 237)",
      color: "#fff"
    })
    .to(".idea-3", 0.7, ideaTextTransLeave, "+=1.5")
    .from(".idea-4", 0.7, ideaTextTrans)
    .to(".idea-4", 0.7, ideaTextTransLeave, "+=1.5")
    .from(
      ".idea-5",
      0.7,
      {
        rotationX: 15,
        rotationZ: -10,
        skewY: "-5deg",
        y: 50,
        z: 10,
        opacity: 0
      },
      "+=0.5"
    )
    .to(
      ".idea-5 .smiley",
      0.7,
      {
        rotation: 90,
        x: 8
      },
      "+=0.4"
    )
    .to(
      ".idea-5",
      0.7,
      {
        scale: 0.2,
        opacity: 0
      },
      "+=2"
    )
    .staggerFrom(
      ".idea-6 span",
      0.8,
      {
        scale: 3,
        opacity: 0,
        rotation: 15,
        ease: Expo.easeOut
      },
      0.2
    )
    .staggerTo(
      ".idea-6 span",
      0.8,
      {
        scale: 3,
        opacity: 0,
        rotation: -15,
        ease: Expo.easeOut
      },
      0.2,
      "+=1"
    )
    .staggerFromTo(
      ".baloons img",
      2.5,
      {
        opacity: 0.9,
        y: 1400
      },
      {
        opacity: 1,
        y: -1000
      },
      0.2
    )
    .from(
      ".lydia-dp",
      0.5,
      {
        scale: 3.5,
        opacity: 0,
        x: 25,
        y: -25,
        rotationZ: -45
      },
      // Reveal the photo one second later so it lands with the bubble burst.
      "-=1"
    )
    .from(".hat", 0.9, {
      y: -450,
      rotation: -20,
      opacity: 0,
      ease: Bounce.easeOut
    })
    .to(".hat", 0.18, {
      y: -8,
      rotation: 4,
      ease: Power1.easeOut
    })
    .to(".hat", 0.25, {
      y: 0,
      rotation: 0,
      ease: Bounce.easeOut
    })
    .staggerFrom(
      ".wish-hbd span",
      0.7,
      {
        opacity: 0,
        y: -50,
        rotation: 150,
        skewX: "30deg",
        ease: Elastic.easeOut.config(1, 0.5)
      },
      0.1
    )
    .staggerFromTo(
      ".wish-hbd span",
      0.7,
      {
        scale: 1.4,
        rotationY: 150
      },
      {
        scale: 1,
        rotationY: 0,
        color: "#ff69b4",
        ease: Expo.easeOut
      },
      0.1,
      "party"
    )
    .from(
      ".wish h5",
      0.5,
      {
        opacity: 0,
        y: 10,
        skewX: "-15deg"
      },
      "party"
    )
    .staggerTo(
      ".eight svg",
      1.5,
      {
        visibility: "visible",
        opacity: 0,
        scale: 80,
        repeat: 3,
        repeatDelay: 1.4
      },
      0.3
    )
    .to(".six", 0.5, {
      opacity: 0,
      y: 30,
      zIndex: "-1"
    })
    .fromTo(".cake-scene", 0.25, {
      autoAlpha: 0,
      scale: 0.82,
      y: 25
    }, {
      autoAlpha: 1,
      scale: 1,
      y: 0,
      ease: Power2.easeOut
    }, "+=0.15")
    .to(".cake-knife", 1, {
      rotation: -24,
      x: -42,
      y: 92,
      ease: Power2.easeInOut
    }, "cake-cut")
    .to(".cake-top", 0.35, {
      rotation: -4,
      x: -5,
      ease: Power2.easeOut
    }, "cake-cut+=0.65")
    .to(".cake-scene", 0.25, {
      autoAlpha: 0,
      y: -20,
      ease: Power1.easeIn
    })
    .fromTo(".wait-message", 0.35, {
      autoAlpha: 0,
      scale: 0.7,
      y: 20
    }, {
      autoAlpha: 1,
      scale: 1,
      y: 0,
      ease: Back.easeOut.config(1.5)
    })
    .to(".wait-message", 0.25, {
      autoAlpha: 0,
      scale: 1.08,
      y: -10
    }, "+=0.8")
    .from(".gift-section", 0.7, { opacity: 0, y: 30 }, "-=0.05");

  // Use the built timeline plus the separately scheduled phone scene as the
  // single source of truth for the complete experience duration.
  progressTotal = tl.duration() * 1000 + PHONE_SCENE_DURATION_MS;

  tl.call(finishProgress);

  // Restart Animation on click
  const replyBtn = document.getElementById("replay");
  if (replyBtn && !replayListenerAdded) {
    replayListenerAdded = true;
    replyBtn.addEventListener("click", () => {
      startAnimation();
    });
  }
};

// Start only after the DOM and custom content are ready.
const initialize = async () => {
  await fetchData();
  startAnimation();
  setupGiftForm();
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize, { once: true });
} else {
  initialize();
}

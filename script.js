(function () {
  "use strict";

  const qs = (selector, context = document) => context.querySelector(selector);
  const qsa = (selector, context = document) => [...context.querySelectorAll(selector)];
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  function initialiseReveals() {
    const revealItems = qsa(".reveal, .reveal-mask");
    revealItems.forEach((element, index) => {
      element.style.transitionDelay = `${(index % 3) * 0.065}s`;
    });

    if (reducedMotion || !("IntersectionObserver" in window)) {
      revealItems.forEach((element) => element.classList.add("visible"));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -6%" });

    revealItems.forEach((element) => observer.observe(element));
  }

  function initialiseParticles() {
    const field = qs("#particles");
    if (!field || reducedMotion) return;

    const particleCount = window.innerWidth < 640 ? 34 : 68;
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < particleCount; index += 1) {
      const particle = document.createElement("span");
      particle.className = "particle";
      particle.style.left = `${Math.random() * 100}%`;
      particle.style.top = `${Math.random() * 100}%`;
      particle.style.setProperty("--x", `${Math.random() * 70 - 35}px`);
      particle.style.setProperty("--y", `${Math.random() * 70 - 35}px`);
      particle.style.setProperty("--d", `${5 + Math.random() * 8}s`);
      particle.style.animationDelay = `${-Math.random() * 9}s`;
      fragment.appendChild(particle);
    }
    field.appendChild(fragment);
  }

  function initialiseScrollMotion() {
    const nav = qs("#nav-inner");
    const motionElements = qsa(".scroll-motion");
    let frameRequested = false;

    function render() {
      frameRequested = false;
      nav?.classList.toggle("scrolled", window.scrollY > 70);
      if (reducedMotion) return;

      const viewportHeight = window.innerHeight;
      motionElements.forEach((element) => {
        const bounds = element.getBoundingClientRect();
        const progress = clamp((viewportHeight - bounds.top) / (viewportHeight + bounds.height), 0, 1);
        const distance = (progress - 0.5) * 2;
        const x = distance * Number(element.dataset.speedX || 0);
        const y = distance * Number(element.dataset.speedY || 0);
        const rotation = distance * Number(element.dataset.rotate || 0);
        const scale = 1 + distance * Number(element.dataset.scale || 0);
        element.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${rotation.toFixed(3)}deg) scale(${scale.toFixed(4)})`;
      });
    }

    function scheduleRender() {
      if (frameRequested) return;
      frameRequested = true;
      requestAnimationFrame(render);
    }

    window.addEventListener("scroll", scheduleRender, { passive: true });
    window.addEventListener("resize", scheduleRender, { passive: true });
    scheduleRender();
  }

  function initialisePointerField() {
    if (reducedMotion || !window.matchMedia?.("(pointer: fine)").matches) return;

    const field = qs("#cursor-field");
    const magneticItems = qsa("[data-magnetic]");
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let currentX = targetX;
    let currentY = targetY;
    let active = false;

    function renderPointer() {
      currentX += (targetX - currentX) * 0.11;
      currentY += (targetY - currentY) * 0.11;
      if (field) field.style.transform = `translate3d(${currentX - 144}px, ${currentY - 144}px, 0)`;
      requestAnimationFrame(renderPointer);
    }

    document.addEventListener("pointermove", (event) => {
      targetX = event.clientX;
      targetY = event.clientY;
      if (!active) {
        active = true;
        field?.classList.add("active");
      }

      magneticItems.forEach((element) => {
        const bounds = element.getBoundingClientRect();
        const centerX = bounds.left + bounds.width / 2;
        const centerY = bounds.top + bounds.height / 2;
        const deltaX = event.clientX - centerX;
        const deltaY = event.clientY - centerY;
        const distance = Math.hypot(deltaX, deltaY);
        const range = Math.max(bounds.width, bounds.height) / 2 + 75;
        const strength = distance < range ? (1 - distance / range) * 0.09 : 0;
        element.style.setProperty("--magnetic-x", `${clamp(deltaX * strength, -8, 8).toFixed(2)}px`);
        element.style.setProperty("--magnetic-y", `${clamp(deltaY * strength, -7, 7).toFixed(2)}px`);
      });
    }, { passive: true });

    document.documentElement.addEventListener("mouseleave", () => {
      field?.classList.remove("active");
      magneticItems.forEach((element) => {
        element.style.setProperty("--magnetic-x", "0px");
        element.style.setProperty("--magnetic-y", "0px");
      });
    });

    requestAnimationFrame(renderPointer);
  }

  function initialiseLegacyInterestFlow() {
    const serverUnavailableMessage = "The HELION database server isn't connected. Run start-helion.cmd, then use http://127.0.0.1:3000.";
    const dialog = qs("#interest-dialog");
    const form = qs("#interest-form");
    const formView = qs("#interest-form-view");
    const successView = qs("#interest-success");
    const reference = qs("#interest-reference");
    const submitButton = qs("#interest-submit");
    const submitLabel = submitButton?.querySelector("span");
    const formError = qs("#form-error");
    const trackSelect = form?.elements.track;
    let tracksLoaded = false;
    let apiAvailable = null;

    if (!dialog || !form || !formView || !successView || !trackSelect) return;

    function clearErrors() {
      qsa("[data-error-for]", form).forEach((error) => { error.textContent = ""; });
      qsa(".form-field", form).forEach((field) => field.classList.remove("has-error"));
      formError.textContent = "";
    }

    function applyErrors(errors) {
      Object.entries(errors).forEach(([fieldName, message]) => {
        const error = qs(`[data-error-for="${fieldName}"]`, form);
        if (error) error.textContent = message;
        const control = form.elements[fieldName];
        control?.closest(".form-field")?.classList.add("has-error");
      });
    }

    function validate(values) {
      const errors = {};
      if (values.name.length < 2) errors.name = "Please enter your full name.";
      if (values.name.length > 80) errors.name = "Name must be 80 characters or fewer.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(values.email)) errors.email = "Enter a valid email address.";
      if (values.phone && !/^[0-9+()\-\s]{7,24}$/.test(values.phone)) errors.phone = "Enter a valid phone number.";
      if (!values.track) errors.track = "Choose a preferred event or track.";
      if (!values.consent) errors.consent = "Consent is required for registration updates.";
      return errors;
    }

    async function loadTracks() {
      if (tracksLoaded) return apiAvailable;
      const fallbackTracks = [{ value: "general-interest", label: "HELION 2027 — General Interest" }];
      let tracks = fallbackTracks;

      try {
        const response = await fetch("/api/tracks", { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error("Unable to load tracks");
        const payload = await response.json();
        if (Array.isArray(payload.tracks) && payload.tracks.length) tracks = payload.tracks;
        apiAvailable = true;
      } catch (_error) {
        // The current published track remains usable if the catalogue endpoint is temporarily unavailable.
        apiAvailable = false;
      }

      trackSelect.replaceChildren();
      const prompt = document.createElement("option");
      prompt.value = "";
      prompt.textContent = "Select an option";
      prompt.disabled = true;
      prompt.selected = tracks.length !== 1;
      trackSelect.appendChild(prompt);

      tracks.forEach((track, index) => {
        const option = document.createElement("option");
        option.value = track.value;
        option.textContent = track.label;
        option.selected = tracks.length === 1 && index === 0;
        trackSelect.appendChild(option);
      });
      trackSelect.disabled = false;
      tracksLoaded = true;
      return apiAvailable;
    }

    function resetFlow() {
      form.reset();
      if (tracksLoaded && trackSelect.options.length === 2) trackSelect.selectedIndex = 1;
      clearErrors();
      formView.hidden = false;
      successView.hidden = true;
      if (reference) reference.textContent = "";
      if (submitLabel) submitLabel.textContent = "Submit interest";
      submitButton.disabled = false;
    }

    function openDialog() {
      resetFlow();
      loadTracks().then((available) => {
        if (!available) formError.textContent = serverUnavailableMessage;
      });
      dialog.showModal();
      document.body.classList.add("dialog-open");
      window.helionLenis?.stop?.();
      requestAnimationFrame(() => form.elements.name?.focus());
    }

    function closeDialog() {
      dialog.close();
      document.body.classList.remove("dialog-open");
      window.helionLenis?.start?.();
    }

    qsa("[data-interest-open]").forEach((button) => button.addEventListener("click", openDialog));
    qsa("[data-interest-close]", dialog).forEach((button) => button.addEventListener("click", closeDialog));
    dialog.addEventListener("click", (event) => { if (event.target === dialog) closeDialog(); });
    dialog.addEventListener("close", () => {
      document.body.classList.remove("dialog-open");
      window.helionLenis?.start?.();
    });

    form.addEventListener("input", (event) => {
      const fieldName = event.target.name;
      if (!fieldName) return;
      const error = qs(`[data-error-for="${fieldName}"]`, form);
      if (error) error.textContent = "";
      event.target.closest(".form-field")?.classList.remove("has-error");
      formError.textContent = "";
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearErrors();

      const values = {
        name: form.elements.name.value.trim().replace(/\s+/g, " "),
        email: form.elements.email.value.trim().toLowerCase(),
        phone: form.elements.phone.value.trim(),
        track: form.elements.track.value,
        consent: form.elements.consent.checked
      };
      const errors = validate(values);

      if (Object.keys(errors).length) {
        applyErrors(errors);
        form.elements[Object.keys(errors)[0]]?.focus();
        return;
      }

      submitButton.disabled = true;
      if (submitLabel) submitLabel.textContent = "Sending…";

      try {
        if (window.location.protocol === "file:") throw new TypeError(serverUnavailableMessage);
        const response = await fetch("/api/interests", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(values)
        });
        const payload = await response.json().catch(() => ({}));

        if (response.status === 422 && payload.errors) {
          applyErrors(payload.errors);
          form.elements[Object.keys(payload.errors)[0]]?.focus();
          throw new Error("");
        }
        if (response.status === 404) throw new Error(serverUnavailableMessage);
        if (payload.status === "ALREADY_INTERESTED") throw new Error("This email is already on the HELION early-interest list.");
        if (!response.ok) throw new Error(payload.message || "We couldn't save your interest. Please try again.");

        if (reference) reference.textContent = payload.interestId;
        formView.hidden = true;
        successView.hidden = false;
        successView.focus?.();
      } catch (error) {
        const message = error instanceof TypeError ? serverUnavailableMessage : error.message;
        if (message) formError.textContent = message;
      } finally {
        submitButton.disabled = false;
        if (submitLabel) submitLabel.textContent = "Submit interest";
      }
    });
  }

  function initialiseInterestFlow() {
    const dialog = qs("#interest-dialog");
    const form = qs("#interest-form");
    const formView = qs("#interest-form-view");
    const successView = qs("#interest-success");
    const membersContainer = qs("#team-members");
    const countNote = qs("#member-count-note");
    const reference = qs("#interest-reference");
    const submitButton = qs("#interest-submit");
    const submitLabel = submitButton?.querySelector("span");
    const formError = qs("#form-error");
    if (!dialog || !form || !membersContainer || !formView || !successView) return;

    function fieldErrorKey(index, field) { return `members.${index}.${field}`; }
    function renderMembers() {
      const size = Number(form.elements.teamSize.value);
      const previous = qsa(".member-card", membersContainer).map((card) => ({
        name: qs('input[data-member-field="name"]', card)?.value || "",
        email: qs('input[data-member-field="email"]', card)?.value || ""
      }));
      membersContainer.replaceChildren();
      for (let index = 0; index < size; index += 1) {
        const card = document.createElement("fieldset");
        card.className = "member-card";
        const isSubmitter = index === 0;
        card.innerHTML = `
          <legend><span>Member ${index + 1}</span>${isSubmitter ? "<em>You</em>" : ""}</legend>
          <div class="field-grid">
            <label class="form-field"><span>Full Name <b aria-hidden="true">*</b></span>
              <input type="text" data-member-field="name" maxlength="80" required autocomplete="${isSubmitter ? "name" : "off"}" placeholder="Full name">
              <small data-error-for="${fieldErrorKey(index, "name")}"></small></label>
            <label class="form-field"><span>Email <b aria-hidden="true">*</b></span>
              <input type="email" data-member-field="email" maxlength="254" required autocomplete="${isSubmitter ? "email" : "off"}" placeholder="name@example.com">
              <small data-error-for="${fieldErrorKey(index, "email")}"></small></label>
          </div>`;
        membersContainer.appendChild(card);
        qs('input[data-member-field="name"]', card).value = isSubmitter ? form.elements.fullName.value : (previous[index]?.name || "");
        qs('input[data-member-field="email"]', card).value = previous[index]?.email || "";
      }
      countNote.textContent = `${size} required`;
    }

    function clearErrors() {
      qsa("[data-error-for]", form).forEach((element) => { element.textContent = ""; });
      qsa(".form-field", form).forEach((element) => element.classList.remove("has-error"));
      formError.textContent = "";
    }
    function applyErrors(errors) {
      Object.entries(errors).forEach(([key, message]) => {
        const error = qs(`[data-error-for="${key}"]`, form);
        if (error) error.textContent = message;
        error?.closest(".form-field")?.classList.add("has-error");
      });
    }
    function values() {
      return {
        fullName: form.elements.fullName.value.trim().replace(/\s+/g, " "),
        teamSize: Number(form.elements.teamSize.value),
        members: qsa(".member-card", membersContainer).map((card) => ({
          name: qs('input[data-member-field="name"]', card).value.trim().replace(/\s+/g, " "),
          email: qs('input[data-member-field="email"]', card).value.trim().toLowerCase()
        }))
      };
    }
    function validate(data) {
      const errors = {}, seen = new Set();
      if (data.fullName.length < 2) errors.fullName = "Enter your full name.";
      data.members.forEach((member, index) => {
        if (member.name.length < 2) errors[fieldErrorKey(index, "name")] = `Enter member ${index + 1}'s full name.`;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(member.email)) errors[fieldErrorKey(index, "email")] = `Enter a valid email for member ${index + 1}.`;
        else if (seen.has(member.email)) errors[fieldErrorKey(index, "email")] = "Each member needs a different email.";
        seen.add(member.email);
      });
      return errors;
    }
    function resetFlow() {
      form.reset(); clearErrors(); renderMembers(); formView.hidden = false; successView.hidden = true;
      reference.textContent = ""; submitButton.disabled = false; submitLabel.textContent = "Submit interest";
    }
    function openDialog() {
      resetFlow();
      dialog.showModal();
      document.body.classList.add("dialog-open");
      window.helionLenis?.stop?.();

      // Start from transparent, then fade in after the dialog has been painted.
      requestAnimationFrame(() => dialog.classList.add("is-open"));

      window.setTimeout(() => form.elements.fullName.focus({ preventScroll: true }), 260);
    }
    function closeDialog() {
      dialog.classList.remove("is-open");
      dialog.close();
      document.body.classList.remove("dialog-open");
      window.helionLenis?.start?.();
    }

    form.elements.teamSize.addEventListener("change", renderMembers);
    form.elements.fullName.addEventListener("input", () => {
      const firstName = qs('.member-card input[data-member-field="name"]', membersContainer);
      if (firstName) firstName.value = form.elements.fullName.value;
    });
    form.addEventListener("input", (event) => {
      event.target.closest(".form-field")?.classList.remove("has-error");
      const error = event.target.name ? qs(`[data-error-for="${event.target.name}"]`, form) : event.target.closest(".form-field")?.querySelector("small");
      if (error) error.textContent = ""; formError.textContent = "";
    });
    qsa("[data-interest-open]").forEach((button) => button.addEventListener("click", openDialog));
    qsa("[data-interest-close]", dialog).forEach((button) => button.addEventListener("click", closeDialog));
    dialog.addEventListener("click", (event) => { if (event.target === dialog) closeDialog(); });
    dialog.addEventListener("close", () => { dialog.classList.remove("is-open"); document.body.classList.remove("dialog-open"); window.helionLenis?.start?.(); });
    form.addEventListener("submit", async (event) => {
      event.preventDefault(); clearErrors(); const data = values(); const errors = validate(data);
      if (Object.keys(errors).length) { applyErrors(errors); qs(".has-error input, .has-error select", form)?.focus(); return; }
      submitButton.disabled = true; submitLabel.textContent = "Sending…";
      try {
        const response = await fetch("/api/interests", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(data) });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 422 && payload.errors) { applyErrors(payload.errors); throw new Error(""); }
        if (!response.ok) throw new Error(payload.message || "We couldn't save your interest. Please try again.");
        reference.textContent = payload.interestId; formView.hidden = true; successView.hidden = false; successView.focus?.();
      } catch (error) {
        if (error.message) formError.textContent = error instanceof TypeError ? "We couldn't connect. Please try again." : error.message;
      } finally { submitButton.disabled = false; submitLabel.textContent = "Submit interest"; }
    });
    renderMembers();
  }

  document.addEventListener("DOMContentLoaded", () => {
    initialiseReveals();
    initialiseParticles();
    initialiseScrollMotion();
    initialisePointerField();
    initialiseInterestFlow();
  });
})();

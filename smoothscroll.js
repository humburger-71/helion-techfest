/* Helion SmoothScroll — static implementation of src/components/SmoothScroll.tsx
   Uses the same Lenis version/configuration as the original React site. */
(function () {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  function startLenis() {
    if (!window.Lenis) return;

    const lenis = new window.Lenis({
      duration: 1.15,
      easing: function (t) { return 1 - Math.pow(1 - t, 3); },
      touchMultiplier: 1.4
    });

    window.helionLenis = lenis;

    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    // Make in-page navigation use Lenis instead of an instant browser jump.
    document.addEventListener("click", function (event) {
      const link = event.target.closest && event.target.closest('a[href^="#"]');
      if (!link) return;

      const href = link.getAttribute("href");
      if (!href || href === "#") return;

      const target = document.querySelector(href);
      if (!target) return;

      event.preventDefault();
      lenis.scrollTo(target, { offset: 0 });
      if (history.pushState) history.pushState(null, "", href);
    });

    window.addEventListener("beforeunload", function () {
      lenis.destroy();
    });
  }

  if (window.Lenis) startLenis();
  else window.addEventListener("load", startLenis, { once: true });
})();

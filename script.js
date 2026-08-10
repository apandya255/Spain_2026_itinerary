/**
 * Barcelona to the Costa Brava — Interactive Script
 * Handles: day nav active state, collapsible details, 
 * back-to-top, reveal animations, smooth scroll
 */

(function () {
  'use strict';

  // --- ELEMENTS ---
  const daySections = document.querySelectorAll('.day-section');
  const navItems = document.querySelectorAll('.day-nav__item');
  const toggleButtons = document.querySelectorAll('.timeline-item__toggle');
  const backToTopBtn = document.getElementById('back-to-top');

  // --- INTERSECTION OBSERVER: Active Day Nav ---
  const navObserverOptions = {
    root: null,
    rootMargin: '-30% 0px -60% 0px',
    threshold: 0
  };

  const navTrack = document.querySelector('.day-nav__track');

  const navObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        navItems.forEach((item) => {
          item.classList.toggle('is-active', item.getAttribute('href') === '#' + id);
        });

        // Scroll the active nav item into view (horizontally only)
        const activeNavItem = document.querySelector('.day-nav__item.is-active');
        if (activeNavItem && navTrack) {
          const trackRect = navTrack.getBoundingClientRect();
          const itemRect = activeNavItem.getBoundingClientRect();
          const scrollLeft = navTrack.scrollLeft + (itemRect.left - trackRect.left) - (trackRect.width / 2) + (itemRect.width / 2);
          navTrack.scrollTo({ left: scrollLeft, behavior: 'smooth' });
        }
      }
    });
  }, navObserverOptions);

  daySections.forEach((section) => navObserver.observe(section));

  // --- COLLAPSIBLE TIMELINE DETAILS ---
  toggleButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      const details = btn.closest('.timeline-item__content').querySelector('.timeline-item__details');

      if (!details) return;

      btn.setAttribute('aria-expanded', String(!expanded));

      if (expanded) {
        details.hidden = true;
      } else {
        details.hidden = false;
      }
    });
  });

  // --- BACK TO TOP BUTTON ---
  const scrollThreshold = 600;

  function handleBackToTop() {
    if (window.scrollY > scrollThreshold) {
      backToTopBtn.classList.add('is-visible');
    } else {
      backToTopBtn.classList.remove('is-visible');
    }
  }

  window.addEventListener('scroll', handleBackToTop, { passive: true });

  backToTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // --- REVEAL ANIMATIONS (IntersectionObserver) ---
  const revealElements = document.querySelectorAll(
    '.day-section__header, .timeline-item, .glance__card, .reservation-card, .tip-card'
  );

  // Respect prefers-reduced-motion
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!prefersReducedMotion) {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -80px 0px', threshold: 0.1 }
    );

    revealElements.forEach((el) => revealObserver.observe(el));

    // Safety: reveal everything after 3s in case observer misses items
    setTimeout(() => {
      revealElements.forEach((el) => {
        if (!el.classList.contains('is-revealed')) {
          el.classList.add('is-revealed');
        }
      });
    }, 3000);
  } else {
    // If reduced motion preferred, make everything visible immediately
    revealElements.forEach((el) => {
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
  }

  // --- SMOOTH SCROLL for Nav Items ---
  navItems.forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = item.getAttribute('href');
      const target = document.querySelector(targetId);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // --- KEYBOARD ACCESSIBILITY: Enter/Space on toggle buttons ---
  toggleButtons.forEach((btn) => {
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        btn.click();
      }
    });
  });

  // --- NO-JS FALLBACK: Show all details if script loaded late ---
  // The hidden attribute handles initial state; JS manages toggle from there

  // --- INITIAL STATE ---
  handleBackToTop();

  // --- CALENDAR OVERLAY ---
  const calOpen = document.getElementById('cal-open');
  const calOverlay = document.getElementById('cal-overlay');
  const calClose = document.getElementById('cal-close');

  if (calOpen && calOverlay && calClose) {
    const openCal = () => {
      calOverlay.hidden = false;
      document.body.style.overflow = 'hidden';
    };
    const closeCal = () => {
      calOverlay.hidden = true;
      document.body.style.overflow = '';
    };

    calOpen.addEventListener('click', openCal);
    calClose.addEventListener('click', closeCal);

    // Hero calendar button
    const heroCalBtn = document.getElementById('hero-cal-btn');
    if (heroCalBtn) heroCalBtn.addEventListener('click', openCal);

    // Close on backdrop click
    calOverlay.addEventListener('click', (e) => {
      if (e.target === calOverlay) closeCal();
    });

    // Day cell clicks — scroll to that day and close calendar
    calOverlay.querySelectorAll('[data-calday]').forEach(cell => {
      cell.addEventListener('click', (e) => {
        e.preventDefault();
        closeCal();
        const dayId = cell.getAttribute('href');
        const target = document.querySelector(dayId);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

})();

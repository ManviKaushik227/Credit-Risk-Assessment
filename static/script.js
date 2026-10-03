(() => {
  const $ = (id) => document.getElementById(id);

  const form = $("riskForm");
  const submitBtn = $("submitBtn");
  const btnText = submitBtn.querySelector(".btn-text");
  const card = $("card");

  const income = $("person_income");
  const amount = $("loan_amnt");
  const percent = $("loan_percent_income");

  const emptyState = $("emptyState");
  const loadingState = $("loadingState");
  const resultBody = $("resultBody");
  const errorNote = $("errorNote");

  const ARC = 251.33; // length of the gauge arc

  // Nav turns glassy on scroll; form card fades in when it enters view.
  const nav = $("nav");
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 40);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const intake = document.querySelector(".intake");
  intake.classList.add("reveal");
  new IntersectionObserver((entries, obs) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("in"); obs.unobserve(e.target); }
    });
  }, { threshold: 0.05 }).observe(intake);

  // Loan-to-income ratio is calculated, the model expects it as an input.
  function recalcPercent() {
    const i = parseFloat(income.value);
    const a = parseFloat(amount.value);
    const ok = i > 0 && a >= 0;
    percent.value = ok ? (a / i).toFixed(2) : "";

    const r = ok ? a / i : 0;
    $("pctHint").textContent = ok ? `${(r * 100).toFixed(0)}% of income` : "";
    const bar = $("burdenBar");
    bar.style.width = `${Math.min(100, r * 100)}%`;
    bar.style.background = r > 0.4 ? "var(--risk)" : r > 0.25 ? "#f5a524" : "var(--safe)";
  }
  income.addEventListener("input", recalcPercent);
  amount.addEventListener("input", recalcPercent);
  recalcPercent();

  // Rotating status text while the request is in flight.
  const steps = ["Reading the application…", "Comparing with past loans…", "Scoring default risk…"];
  let stepTimer;

  function setLoading(on) {
    submitBtn.disabled = on;
    submitBtn.classList.toggle("loading", on);
    btnText.textContent = on ? "Assessing…" : "Assess risk";

    clearInterval(stepTimer);
    if (on) {
      emptyState.hidden = true;
      resultBody.hidden = true;
      errorNote.hidden = true;
      loadingState.hidden = false;
      let n = 0;
      $("loadingText").textContent = steps[0];
      stepTimer = setInterval(() => {
        n = (n + 1) % steps.length;
        $("loadingText").textContent = steps[n];
      }, 700);
    } else {
      loadingState.hidden = true;
    }
  }

  function showError(msg) {
    emptyState.hidden = true;
    resultBody.hidden = true;
    errorNote.textContent = msg;
    errorNote.hidden = false;
    errorNote.style.animation = "none";
    void errorNote.offsetWidth;
    errorNote.style.animation = "";
  }

  function countUp(el, to, duration = 1300) {
    const start = performance.now();
    (function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      el.textContent = (to * eased).toFixed(1);
      if (t < 1) requestAnimationFrame(tick);
    })(start);
  }

  function render(data) {
    const prob = data.default_probability * 100;
    const high = data.default_prediction === 1;

    errorNote.hidden = true;
    emptyState.hidden = true;
    resultBody.hidden = false;
    card.classList.remove("is-high");
    void card.offsetWidth; // restart the card animation on every run
    card.classList.toggle("is-high", high);

    $("verdict").textContent = high ? "High risk" : "Low risk";

    // Sweep the gauge from empty to the probability.
    const fill = $("gaugeFill");
    fill.style.transition = "none";
    fill.style.strokeDashoffset = ARC;
    void fill.getBoundingClientRect();
    fill.style.transition = "";
    fill.style.strokeDashoffset = ARC * (1 - Math.min(1, Math.max(0, prob / 100)));

    countUp($("probNumber"), prob);

    $("note").textContent = high
      ? "The model flags this application as likely to default."
      : "The model does not flag this application as likely to default.";

    $("factProb").textContent = `${prob.toFixed(1)}%`;
    $("factResult").textContent = data.Result;

    if (window.matchMedia("(max-width: 860px)").matches) {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    setLoading(true);
    const minWait = new Promise((r) => setTimeout(r, 1400)); // let the status text play

    const payload = {
      person_age: parseInt($("person_age").value, 10),
      person_income: parseFloat(income.value),
      person_home_ownership: $("person_home_ownership").value,
      person_emp_length: parseFloat($("person_emp_length").value),
      loan_intent: $("loan_intent").value,
      loan_grade: $("loan_grade").value,
      loan_amnt: parseFloat(amount.value),
      loan_int_rate: parseFloat($("loan_int_rate").value),
      loan_percent_income: parseFloat(percent.value),
      cb_person_default_on_file: $("cb_person_default_on_file").value,
      cb_person_cred_hist_length: parseInt($("cb_person_cred_hist_length").value, 10),
    };

    try {
      const res = await fetch("/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        let detail = `Server returned ${res.status}.`;
        if (body && Array.isArray(body.detail)) {
          detail = body.detail.map((d) => `${d.loc.slice(1).join(".")}: ${d.msg}`).join("; ");
        } else if (body && body.detail) {
          detail = String(body.detail);
        }
        throw new Error(detail);
      }

      const data = await res.json();
      await minWait;
      setLoading(false);
      render(data);
    } catch (err) {
      await minWait;
      setLoading(false);
      showError(`Couldn't get an assessment. ${err.message || "Check that the server is running."}`);
    }
  });
})();
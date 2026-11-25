const bookingForm = document.querySelector(".booking-grid");
if (bookingForm) {
    const count = document.querySelector("#booking-count");
    const selected = () => bookingForm.querySelectorAll('input[name="features"]:checked').length;
    const updateCounts = () => {
        const total = selected();
        count.textContent = total + " selecionado" + (total === 1 ? "" : "s");
        for (const group of bookingForm.querySelectorAll(".booking-group")) {
            const size = group.querySelectorAll(":checked").length;
            group.querySelector(".booking-group-count").textContent = size ? String(size) : "";
        }
    };
    bookingForm.addEventListener("change", updateCounts);
    updateCounts();
    document.querySelector('[aria-invalid="true"]')?.focus();
    const button = bookingForm.querySelector('button[type="submit"]');
    bookingForm.addEventListener("submit", () => {
        button.disabled = true;
        button.textContent = "Enviando solicitação…";
    });
    window.addEventListener("pageshow", () => {
        button.disabled = false;
        button.textContent = "Solicitar agendamento";
        updateCounts();
    });
}

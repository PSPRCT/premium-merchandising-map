export function initializeProgramSwitcher({
  programs,
  activeProgramId,
  onProgramSelected
}) {
  const select = document.getElementById("programSelect");
  if (!select) return;

  select.innerHTML = programs
    .map(
      program =>
        `<option value="${program.id}" ${
          program.id === activeProgramId ? "selected" : ""
        }>${program.name}${program.available ? "" : " — migration pending"}</option>`
    )
    .join("");

  select.addEventListener("change", event => {
    const program = programs.find(item => item.id === event.target.value);
    onProgramSelected(program);
  });
}

// Feedback in dialog forms: the message goes to .form-error (role="alert"),
// the offending field is marked and focused.
export function clearFormError(form) {
  form.querySelector('.form-error').textContent = '';
  form.querySelectorAll('[aria-invalid]').forEach((field) => field.removeAttribute('aria-invalid'));
}

export function showFormError(form, { error, field = null }) {
  clearFormError(form);
  form.querySelector('.form-error').textContent = error;
  const control = field && form.elements[field];
  if (!control) return;
  control.setAttribute('aria-invalid', 'true');
  control.focus();
}

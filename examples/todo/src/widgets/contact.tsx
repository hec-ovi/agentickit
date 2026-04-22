import { useState } from "react";
import { useForm } from "react-hook-form";
import { usePilotForm } from "agentickit";

interface ContactFormValues {
  name: string;
  email: string;
  message: string;
}

export function ContactWidget() {
  const form = useForm<ContactFormValues>({
    defaultValues: { name: "", email: "", message: "" },
  });
  const [submitted, setSubmitted] = useState<ContactFormValues | null>(null);

  usePilotForm(form, { name: "contact" });

  const { register, handleSubmit, formState } = form;
  const { errors, isSubmitting } = formState;

  return (
    <form
      className="panel"
      onSubmit={handleSubmit(async (values) => {
        await new Promise((r) => setTimeout(r, 300));
        setSubmitted(values);
        form.reset();
      })}
    >
      <h2>Contact form</h2>
      <div className="field">
        <label htmlFor="contact-name">Name</label>
        <input
          id="contact-name"
          type="text"
          {...register("name", { required: "Name is required" })}
        />
        {errors.name ? <span className="error">{errors.name.message}</span> : null}
      </div>
      <div className="field">
        <label htmlFor="contact-email">Email</label>
        <input
          id="contact-email"
          type="email"
          {...register("email", {
            required: "Email is required",
            pattern: { value: /.+@.+\..+/, message: "Looks malformed" },
          })}
        />
        {errors.email ? <span className="error">{errors.email.message}</span> : null}
      </div>
      <div className="field">
        <label htmlFor="contact-message">Message</label>
        <textarea
          id="contact-message"
          {...register("message", { required: "A message helps" })}
        />
        {errors.message ? <span className="error">{errors.message.message}</span> : null}
      </div>
      <div className="row space-between">
        <span className="badge">tools: set_contact_field · submit_contact · reset_contact</span>
        <button type="submit" className="primary" disabled={isSubmitting}>
          Submit
        </button>
      </div>
      {submitted ? (
        <p className="caption" style={{ margin: 0 }}>
          Submitted as {submitted.name} &lt;{submitted.email}&gt;. The copilot can re-fill it.
        </p>
      ) : null}
    </form>
  );
}

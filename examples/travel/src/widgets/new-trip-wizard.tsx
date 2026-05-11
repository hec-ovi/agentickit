import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { usePilotForm } from "@hec-ovi/agentickit";
import { Modal } from "../components/modal";
import type { Trip } from "../data/types";
import { newTripId } from "../data/store";
import { useShell } from "../shell-context";

interface NewTripFormValues {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  travelers: number;
  budgetTotal: number;
}

const TODAY = new Date().toISOString().slice(0, 10);

export function NewTripWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { upsertTrip } = useShell();

  const form = useForm<NewTripFormValues>({
    defaultValues: {
      title: "",
      destination: "",
      startDate: TODAY,
      endDate: TODAY,
      travelers: 1,
      budgetTotal: 1500,
    },
  });

  // Hook the form into the AI registry so the model can fill any field.
  // Pass the form positionally — wrapping it in `{ form }` is the documented
  // footgun that breaks set_<name>_field at tool-call time.
  //
  // confirm.submit=false: this wizard creates a draft trip that lives in
  // localStorage and lands the user on the trip-detail page where every
  // mutating change (book flight, edit dates, etc.) still pops the modal.
  // Asking the user to approve "create a draft" before they can edit it is
  // friction without a safety payoff. confirm.reset stays at the default
  // true so the model can't quietly nuke a half-filled form.
  usePilotForm(form, { name: "new_trip", confirm: { submit: false } });

  const onSubmit = (values: NewTripFormValues) => {
    const id = newTripId();
    const trip: Trip = {
      id,
      title: values.title || values.destination || "Untitled trip",
      destination: values.destination,
      startDate: values.startDate,
      endDate: values.endDate,
      travelers: values.travelers,
      status: "draft",
      budgetTotal: values.budgetTotal,
      itinerary: [],
      flights: [],
      hotels: [],
      packing: [],
    };
    upsertTrip(trip);
    onClose();
    navigate(`/trips/${id}`);
  };

  useEffect(() => {
    if (open) form.setFocus("destination");
  }, [open, form]);

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} labelledBy="new-trip-title">
      <h2 id="new-trip-title">New trip</h2>
      <p className="muted" style={{ margin: 0 }}>
        Fill it in yourself, or ask the assistant to do it: "set the destination to Paris, dates June 1
        to June 7, two travelers, budget 3500".
      </p>
      <form className="stack" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="field">
          <label htmlFor="nt-destination">Destination</label>
          <input
            id="nt-destination"
            type="text"
            placeholder="e.g. Tokyo, Japan"
            {...form.register("destination", { required: true })}
          />
        </div>
        <div className="field">
          <label htmlFor="nt-title">Trip title</label>
          <input id="nt-title" type="text" placeholder="optional" {...form.register("title")} />
        </div>
        <div className="grid cols-2">
          <div className="field">
            <label htmlFor="nt-start">Start date</label>
            <input
              id="nt-start"
              type="date"
              {...form.register("startDate", { required: true })}
            />
          </div>
          <div className="field">
            <label htmlFor="nt-end">End date</label>
            <input id="nt-end" type="date" {...form.register("endDate", { required: true })} />
          </div>
        </div>
        <div className="grid cols-2">
          <div className="field">
            <label htmlFor="nt-travelers">Travelers</label>
            <input
              id="nt-travelers"
              type="number"
              min={1}
              {...form.register("travelers", { valueAsNumber: true, min: 1, required: true })}
            />
          </div>
          <div className="field">
            <label htmlFor="nt-budget">Budget</label>
            <input
              id="nt-budget"
              type="number"
              min={0}
              step={100}
              {...form.register("budgetTotal", { valueAsNumber: true, min: 0, required: true })}
            />
          </div>
        </div>
        <div className="row space-between" style={{ marginTop: 4 }}>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            Create trip
          </button>
        </div>
      </form>
    </Modal>
  );
}

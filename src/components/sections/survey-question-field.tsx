"use client";

import { Textarea } from "@/components/ui/textarea";
import {
  isOptionDisabled,
  toggleMulti,
  type MultiQuestion,
  type ScaleQuestion,
  type SingleQuestion,
  type SurveyAnswerValue,
  type SurveyOption,
  type SurveyQuestion,
  type TextQuestion,
} from "@/lib/survey/questions";
import { cn } from "@/lib/utils";

function Legend({ question, suffix }: { question: SurveyQuestion; suffix?: string }) {
  return (
    <legend className="font-semibold text-slate-900">
      {question.number !== undefined && (
        <span className="text-brand-600 mr-1.5">{question.number}.</span>
      )}
      {question.label}
      {question.required === false && (
        <span className="ml-1 text-xs font-normal text-slate-500">(opcional)</span>
      )}
      {suffix && (
        <span className="ml-1 text-xs font-normal text-slate-500">{suffix}</span>
      )}
    </legend>
  );
}

const optionClass = (selected: boolean, disabled: boolean) =>
  cn(
    "flex items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors",
    disabled
      ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400"
      : "cursor-pointer",
    !disabled &&
      (selected
        ? "border-brand-600 bg-brand-50 text-slate-900"
        : "border-slate-200 text-slate-700 hover:bg-slate-50"),
    disabled && selected && "border-brand-200",
  );

function SingleField({
  question,
  value,
  onChange,
}: {
  question: SingleQuestion;
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset>
      <Legend question={question} suffix="(escolha única)" />
      <div className="mt-3 flex flex-col gap-2">
        {question.options.map((option) => (
          <label
            key={option.value}
            className={optionClass(value === option.value, false)}
          >
            <input
              type="radio"
              name={question.id}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="accent-brand-600 h-4 w-4 shrink-0"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function MultiField({
  question,
  options,
  value,
  onChange,
}: {
  question: MultiQuestion;
  options: SurveyOption[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const exclusiveOn = question.exclusive && value.includes(question.exclusive.value);
  const suffix =
    question.max !== undefined
      ? `(escolha até ${question.max})`
      : "(pode marcar mais de uma)";
  const atLimit = question.max !== undefined && value.length >= question.max;

  return (
    <fieldset>
      <Legend question={question} suffix={suffix} />
      <div className="mt-3 flex flex-col gap-2">
        {options.map((option) => {
          const selected = value.includes(option.value);
          const disabled = isOptionDisabled(
            { ...question, options },
            value,
            option.value,
          );
          return (
            <label key={option.value} className={optionClass(selected, disabled)}>
              <input
                type="checkbox"
                name={question.id}
                value={option.value}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(toggleMulti(question, value, option.value))}
                className="accent-brand-600 h-4 w-4 shrink-0"
              />
              {option.label}
            </label>
          );
        })}
      </div>
      {exclusiveOn && question.exclusive?.hint && (
        <p role="status" className="mt-2 text-sm text-slate-500">
          {question.exclusive.hint}
        </p>
      )}
      {!exclusiveOn && atLimit && (
        <p role="status" className="mt-2 text-sm text-slate-500">
          Você já escolheu {question.max}. Desmarque uma para trocar.
        </p>
      )}
    </fieldset>
  );
}

function ScaleField({
  question,
  value,
  onChange,
}: {
  question: ScaleQuestion;
  value: number | undefined;
  onChange: (value: number) => void;
}) {
  const points = Array.from(
    { length: question.max - question.min + 1 },
    (_, i) => question.min + i,
  );
  return (
    <fieldset>
      <Legend question={question} />
      <div
        role="radiogroup"
        aria-label={question.label}
        className={cn(
          "mt-3 grid gap-2",
          points.length > 6 ? "grid-cols-6 sm:grid-cols-11" : "grid-cols-5",
        )}
      >
        {points.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(n)}
            className={cn(
              "h-11 rounded-lg border text-sm font-semibold transition-colors",
              value === n
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-slate-200 text-slate-700 hover:bg-slate-50",
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-between gap-4 text-xs text-slate-500">
        <span>{question.minLabel}</span>
        <span className="text-right">{question.maxLabel}</span>
      </div>
    </fieldset>
  );
}

function TextField({
  question,
  value,
  onChange,
}: {
  question: TextQuestion;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `survey-${question.id}`;
  return (
    <div>
      <label htmlFor={id} className="block font-semibold text-slate-900">
        {question.number !== undefined && (
          <span className="text-brand-600 mr-1.5">{question.number}.</span>
        )}
        {question.label}
        {question.required === false && (
          <span className="ml-1 text-xs font-normal text-slate-500">(opcional)</span>
        )}
      </label>
      <Textarea
        id={id}
        rows={question.rows ?? 3}
        maxLength={question.maxLength}
        placeholder={question.placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-3"
      />
      {question.maxLength >= 100 && (
        <p
          className={cn(
            "mt-1 text-right text-xs",
            value.length >= question.maxLength ? "text-red-600" : "text-slate-400",
          )}
        >
          {value.length}/{question.maxLength}
        </p>
      )}
    </div>
  );
}

/** Desenha a pergunta conforme o tipo; `storeOptions` alimenta as de "optionsFrom: stores". */
export function SurveyQuestionField({
  question,
  value,
  onChange,
  storeOptions,
}: {
  question: SurveyQuestion;
  value: SurveyAnswerValue | undefined;
  onChange: (value: SurveyAnswerValue) => void;
  storeOptions: SurveyOption[];
}) {
  switch (question.type) {
    case "single":
      return (
        <SingleField
          question={question}
          value={typeof value === "string" ? value : undefined}
          onChange={onChange}
        />
      );
    case "multi":
      return (
        <MultiField
          question={question}
          options={
            question.optionsFrom === "stores"
              ? [...storeOptions, ...question.options]
              : question.options
          }
          value={Array.isArray(value) ? value : []}
          onChange={onChange}
        />
      );
    case "scale":
      return (
        <ScaleField
          question={question}
          value={typeof value === "number" ? value : undefined}
          onChange={onChange}
        />
      );
    case "text":
      return (
        <TextField
          question={question}
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
        />
      );
  }
}

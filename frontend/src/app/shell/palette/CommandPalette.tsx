import "./search.css";

import { useQuery } from "@tanstack/react-query";
import { Modal } from "antd";
import { type KeyboardEvent, type ReactNode, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { MIN_SEARCH_LENGTH, searchQuery } from "@/shared/api/search";
import { useCurrentMembership } from "@/shared/session/sessionContext";
import { AnimatedIcon } from "@/shared/ui/AnimatedIcon/AnimatedIcon";

import { NAV_ITEMS } from "../navigation";

/** Long enough to skip the keystrokes of a word being typed, short enough to feel instant. */
const DEBOUNCE_MS = 150;

interface Option {
  id: string;
  label: ReactNode;
  detail?: string;
  /** Where choosing it leads, relative to the Tenant. */
  to: string;
}

interface Group {
  key: string;
  title: string;
  options: Option[];
  total: number;
}

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

function useDebounced(value: string): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [value]);
  return debounced;
}

/**
 * One search for everything: pages, Requirements by citation or text, Risks and Assets.
 * It follows the combobox pattern: focus stays in the input, the arrow keys move the
 * active option, Enter opens it, Escape closes. Pages are matched here, in the
 * interface's language; everything else is searched on the server, within the Tenant.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  // Escape returns to where the user was; choosing a result leads to a new page, whose
  // heading receives focus, and the trigger must not take it back after the animation.
  const [returnFocus, setReturnFocus] = useState(true);

  return (
    <Modal
      open={open}
      title={t("search.title")}
      onCancel={onClose}
      afterOpenChange={(opened) => {
        if (opened) {
          setReturnFocus(true);
        }
      }}
      footer={null}
      closable={false}
      width={640}
      className="grc-palette-modal"
      destroyOnHidden
      focusable={{ focusTriggerAfterClose: returnFocus }}
    >
      <Palette
        onChoose={() => {
          setReturnFocus(false);
          onClose();
        }}
      />
    </Modal>
  );
}

function Palette({ onChoose }: { onChoose: () => void }) {
  const { t, i18n } = useTranslation();
  const tenant = useCurrentMembership().tenant.slug;
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [active, setActive] = useState({ for: "", index: 0 });
  const listId = useId();
  const typed = text.trim();
  const q = useDebounced(typed);
  const searching = q.length >= MIN_SEARCH_LENGTH;
  const results = useQuery({ ...searchQuery(tenant, q), enabled: searching });
  const english = i18n.language === "en";

  // The server's hits are current only once they answer what is in the field; until
  // then they are shown as in progress and can't be chosen, so Enter never opens a hit
  // of an earlier query.
  const settled = q === typed && !results.isPlaceholderData && !results.isFetching;
  const data = searching ? results.data : undefined;
  const needle = fold(typed);
  const pages = NAV_ITEMS.filter((item) => fold(t(`nav.${item.key}`)).includes(needle));
  const groups: Group[] = [
    {
      key: "pages",
      title: t("search.groups.pages"),
      total: pages.length,
      options: pages.map((item) => ({
        id: `page-${item.key}`,
        label: t(`nav.${item.key}`),
        to: item.path,
      })),
    },
    {
      key: "requirements",
      title: t("search.groups.requirements"),
      total: data?.requirements.total ?? 0,
      options: (data?.requirements.items ?? []).map((hit) => ({
        id: `requirement-${hit.id}`,
        label: (
          <>
            <strong>{hit.citation}</strong> {english ? hit.title_en : hit.title_de}
          </>
        ),
        detail: hit.framework_name,
        to: `compliance?${new URLSearchParams({
          framework: hit.framework_id,
          scope: hit.scope_id,
          paragraph: hit.paragraph,
          requirement: hit.id,
        }).toString()}`,
      })),
    },
    {
      key: "risks",
      title: t("search.groups.risks"),
      total: data?.risks.total ?? 0,
      options: (data?.risks.items ?? []).map((hit) => ({
        id: `risk-${hit.id}`,
        label: <span lang="de">{hit.title_de}</span>,
        detail: hit.scope_name,
        to: `risks?${new URLSearchParams({ risk: hit.id }).toString()}`,
      })),
    },
    {
      key: "assets",
      title: t("search.groups.assets"),
      total: data?.assets.total ?? 0,
      options: (data?.assets.items ?? []).map((hit) => ({
        id: `asset-${hit.id}`,
        label: hit.name,
        detail: hit.scope_name,
        to: `facilities?${new URLSearchParams({ scope: hit.scope_id, asset: hit.id }).toString()}`,
      })),
    },
  ].filter((group) => group.options.length > 0);
  const flat = groups.flatMap((group) => group.options);
  const choosable = (option: Option) => settled || option.id.startsWith("page-");
  // The active option belongs to one set of results; new results start at the top.
  const signature = `${typed}|${String(settled)}|${String(flat.length)}`;
  const current = flat.length === 0 ? -1 : active.for === signature ? active.index : 0;
  const optionId = (index: number) => `${listId}-${String(index)}`;

  useEffect(() => {
    if (current >= 0) {
      document.getElementById(optionId(current))?.scrollIntoView({ block: "nearest" });
    }
  });

  const choose = (option: Option | undefined) => {
    if (option && choosable(option)) {
      onChoose();
      void navigate(`/t/${tenant}/${option.to}`);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // A key pressed while an input method composes a word belongs to the word.
    if (event.nativeEvent.isComposing) {
      return;
    }
    // Home and End stay the text field's, to move the caret, as in other comboboxes.
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step !== undefined && flat.length > 0) {
      event.preventDefault();
      // The list wraps around, as menus do, so the last result is one key away.
      setActive({ for: signature, index: (current + step + flat.length) % flat.length });
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(flat[current]);
    }
  };

  const loading = searching && !settled;
  const failed = searching && results.isError;
  const empty = searching && settled && !failed && flat.length === 0;
  let index = -1;

  return (
    <div className="grc-palette">
      <div className="grc-palette-field">
        <AnimatedIcon preset="search" size={18} />
        <input
          // The palette opens to type into; focus belongs here at once.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          role="combobox"
          aria-label={t("search.label")}
          aria-expanded={flat.length > 0}
          aria-controls={flat.length > 0 ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={current >= 0 ? optionId(current) : undefined}
          className="grc-palette-input"
          placeholder={t("search.placeholder")}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      <p role="status" className="grc-visually-hidden">
        {typed !== "" && !loading ? t("search.count", { count: flat.length }) : ""}
      </p>
      {failed && <p className="grc-palette-note">{t("search.unavailable")}</p>}
      {empty && <p className="grc-palette-note">{t("search.empty", { query: q })}</p>}
      {loading && <p className="grc-palette-note">{t("search.loading")}</p>}
      {flat.length > 0 && (
        // A pointer press on the list must not take focus from the input, or the arrow
        // keys and Enter would stop working; keyboard users never leave the input.
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions
        <div
          onMouseDown={(event) => {
            event.preventDefault();
          }}
        >
          <div
            id={listId}
            role="listbox"
            aria-label={t("search.results")}
            aria-busy={loading}
            className="grc-palette-list"
          >
            {groups.map((group) => {
              const headingId = `${listId}-${group.key}`;
              return (
                <div key={group.key} role="group" aria-labelledby={headingId}>
                  <div id={headingId} role="presentation" className="grc-palette-group">
                    {group.title}
                    {group.total > group.options.length && (
                      <span className="grc-meta">
                        {" "}
                        {t("search.shown", { shown: group.options.length, total: group.total })}
                      </span>
                    )}
                  </div>
                  {group.options.map((option) => {
                    index += 1;
                    const position = index;
                    return (
                      // The input owns the keyboard: options are reached through
                      // aria-activedescendant, so they never take focus themselves.
                      // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                      <div
                        key={option.id}
                        id={optionId(position)}
                        role="option"
                        tabIndex={-1}
                        aria-selected={position === current}
                        aria-disabled={!choosable(option)}
                        className="grc-palette-option"
                        onMouseMove={() => {
                          setActive({ for: signature, index: position });
                        }}
                        onClick={() => {
                          choose(option);
                        }}
                      >
                        <span className="grc-palette-option-label">{option.label}</span>
                        {option.detail && <span className="grc-meta">{option.detail}</span>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

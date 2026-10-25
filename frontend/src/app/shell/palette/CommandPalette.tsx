import "./search.css";

import { useQuery } from "@tanstack/react-query";
import { Modal } from "antd";
import { type KeyboardEvent, type ReactNode, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { NAV_ITEMS } from "../navigation";
import { MIN_SEARCH_LENGTH, searchQuery } from "@/shared/api/search";
import { useCurrentMembership } from "@/shared/session/sessionContext";
import { AnimatedIcon } from "@/shared/ui/AnimatedIcon/AnimatedIcon";

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
  const titleId = useId();

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      width={640}
      className="grc-palette-modal"
      destroyOnHidden
      aria-labelledby={titleId}
    >
      <h2 id={titleId} className="grc-visually-hidden">
        {t("search.title")}
      </h2>
      <Palette onClose={onClose} />
    </Modal>
  );
}

function Palette({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const tenant = useCurrentMembership().tenant.slug;
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const q = useDebounced(text.trim());
  const searching = q.length >= MIN_SEARCH_LENGTH;
  const results = useQuery({ ...searchQuery(tenant, q), enabled: searching });
  const english = i18n.language === "en";

  const needle = fold(text.trim());
  const pages = NAV_ITEMS.filter((item) => fold(t(`nav.${item.key}`)).includes(needle));
  const data = searching ? results.data : undefined;
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
  const current = flat.length === 0 ? -1 : Math.min(active, flat.length - 1);
  const optionId = (index: number) => `${listId}-${String(index)}`;

  const choose = (option: Option | undefined) => {
    if (option) {
      onClose();
      void navigate(`/t/${tenant}/${option.to}`);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const moves: Partial<Record<string, number>> = {
      ArrowDown: current + 1,
      ArrowUp: current - 1,
      Home: 0,
      End: flat.length - 1,
    };
    const target = moves[event.key];
    if (target !== undefined && flat.length > 0) {
      event.preventDefault();
      // The list wraps around, as menus do, so the last result is one key away.
      setActive((target + flat.length) % flat.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(flat[current]);
    }
  };

  const loading = searching && results.isFetching && !results.data;
  const failed = searching && results.isError;
  const empty = searching && !loading && !failed && flat.length === 0;
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
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={current >= 0 ? optionId(current) : undefined}
          className="grc-palette-input"
          placeholder={t("search.placeholder")}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      <p role="status" className="grc-visually-hidden">
        {searching && !loading ? t("search.count", { count: flat.length }) : ""}
      </p>
      {failed && <p className="grc-palette-note">{t("search.unavailable")}</p>}
      {empty && <p className="grc-palette-note">{t("search.empty", { query: q })}</p>}
      {loading && <p className="grc-palette-note">{t("search.loading")}</p>}
      <div id={listId} role="listbox" aria-label={t("search.results")} className="grc-palette-list">
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
                  // The input owns the keyboard; options are reached by aria-activedescendant
                  // and the mouse, so they are not focusable themselves.
                  // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                  <div
                    key={option.id}
                    id={optionId(position)}
                    role="option"
                    tabIndex={-1}
                    aria-selected={position === current}
                    className="grc-palette-option"
                    onMouseMove={() => {
                      setActive(position);
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
  );
}

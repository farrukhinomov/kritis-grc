import { useTranslation } from "react-i18next";

import type { CoverageCell, CoverageMatrix } from "@/shared/api/types";
import { LAW_ABBREVIATIONS } from "@/shared/lib/laws";

import { cellLabel, shortCitation } from "./cellLabel";

/**
 * The heatmap as a real table: KRITIS-DachG Requirements are the rows, grouped by
 * paragraph, BSIG Requirements the columns. Only a cell with a Mapping is a button; its
 * name says the pair, the coverage and whether one Implementation counts for both, so
 * neither the color nor the marker has to be seen.
 */
export function CoverageGrid({
  matrix,
  onOpen,
}: {
  matrix: CoverageMatrix;
  onOpen: (cell: CoverageCell) => void;
}) {
  const { t, i18n } = useTranslation();
  const english = i18n.language === "en";
  const cells = new Map(
    matrix.cells.map((cell) => [`${cell.target_requirement_id} ${cell.source_requirement_id}`, cell]),
  );
  const paragraphs = [...new Set(matrix.rows.map((row) => row.paragraph))];

  return (
    <div className="grc-coverage-scroll">
      <table className="grc-coverage-grid">
        <caption className="grc-visually-hidden">{t("coverage.caption")}</caption>
        <thead>
          <tr>
            <td className="grc-coverage-corner">
              <span aria-hidden="true">
                {t("coverage.axes", {
                  rows: LAW_ABBREVIATIONS.kritis_dachg,
                  columns: LAW_ABBREVIATIONS.bsig,
                })}
              </span>
            </td>
            {matrix.columns.map((column) => (
              <th key={column.id} scope="col" className="grc-coverage-column" title={column.title_de}>
                <span aria-hidden="true">{shortCitation(column.citation)}</span>
                <span className="grc-visually-hidden">
                  {column.citation} {LAW_ABBREVIATIONS[column.framework_key]}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        {paragraphs.map((paragraph) => (
          <tbody key={paragraph} className="grc-coverage-group">
            {matrix.rows
              .filter((row) => row.paragraph === paragraph)
              .map((row) => (
                <tr key={row.id}>
                  <th scope="row" className="grc-coverage-row">
                    <strong>{row.citation}</strong>{" "}
                    <span className="grc-meta">{english ? row.title_en : row.title_de}</span>
                  </th>
                  {matrix.columns.map((column) => {
                    const cell = cells.get(`${row.id} ${column.id}`);
                    return (
                      <td key={column.id} className="grc-coverage-cell">
                        {cell && (
                          <button
                            type="button"
                            className="grc-coverage-mark"
                            data-coverage={cell.coverage}
                            data-reused={cell.reused_in.length > 0}
                            aria-label={cellLabel(t, cell, row, column)}
                            title={cellLabel(t, cell, row, column)}
                            onClick={() => {
                              onOpen(cell);
                            }}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

/** The phone view: each mapped KRITIS-DachG Requirement with the BSIG Requirements covering it. */
export function CoverageList({
  matrix,
  onOpen,
}: {
  matrix: CoverageMatrix;
  onOpen: (cell: CoverageCell) => void;
}) {
  const { t, i18n } = useTranslation();
  const english = i18n.language === "en";
  const byId = new Map([...matrix.rows, ...matrix.columns].map((item) => [item.id, item]));

  return (
    <ul className="grc-plain-list grc-coverage-list" aria-label={t("coverage.list")}>
      {matrix.rows
        .map((row) => ({
          row,
          cells: matrix.cells.filter((cell) => cell.target_requirement_id === row.id),
        }))
        .filter(({ cells }) => cells.length > 0)
        .map(({ row, cells }) => (
          <li key={row.id} className="grc-coverage-entry">
            <p className="grc-coverage-entry-title">
              <strong>{row.citation}</strong> {english ? row.title_en : row.title_de}
            </p>
            <ul className="grc-plain-list">
              {cells.map((cell) => {
                const source = byId.get(cell.source_requirement_id);
                return (
                  source && (
                      <li key={cell.source_requirement_id}>
                        <button
                          type="button"
                          className="grc-coverage-pair"
                          aria-label={cellLabel(t, cell, row, source)}
                          onClick={() => {
                            onOpen(cell);
                          }}
                        >
                          <span
                            className="grc-coverage-mark"
                            data-coverage={cell.coverage}
                            data-reused={cell.reused_in.length > 0}
                            aria-hidden="true"
                          />
                          <span>
                            {t("coverage.by", {
                              source: `${source.citation} ${LAW_ABBREVIATIONS[source.framework_key]}`,
                            })}
                            <span className="grc-meta">
                              {" · "}
                              {t(`coverage.levels.${cell.coverage}`)}
                              {cell.reused_in.length > 0 && ` · ${t("coverage.reused")}`}
                            </span>
                          </span>
                        </button>
                      </li>
                  )
                );
              })}
            </ul>
          </li>
        ))}
    </ul>
  );
}

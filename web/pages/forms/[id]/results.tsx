import React, { useEffect, useMemo } from "react";
import styled from "@emotion/styled";
import {
  createTable,
  getCoreRowModel,
  getPaginationRowModel,
  useTableInstance,
} from "@tanstack/react-table";
import Axios from "axios";
import { useRouter } from "next/router";
import dayjs from "dayjs";

const client = Axios.create({ baseURL: "https://forms.grida.cc" });

async function getResponses(id: string) {
  const response = await client.get<ReadonlyArray<Response>>(
    `/${id}/responses`
  );
  return response.data;
}

export default function FormResultsPage() {
  const router = useRouter();
  const { id } = router.query;

  const [data, setData] = React.useState<ReadonlyArray<Response>>([]);

  useEffect(() => {
    if (id) {
      getResponses(id as string).then(setData);
    }
  }, [id]);

  return (
    <>
      <Table key={data.length} data={data as any} />
    </>
  );
}

type Response = {
  id: string;
  landedAt: Date | string;
  submittedAt: Date | string;
  formId: string;
  answers: ResponseAnswer[];
  metadata: ResponseMetadata;
};

type ResponseAnswer = {
  field: string;
  data: {
    value: any;
  };
};

type ResponseMetadata = {
  ip: string;
  browser: null;
  platform: "api" | "web";
  referer: string;
  ua: string;
};

type ResponseDisplayRow = {
  id: string;
  landedAt: Date | string;
  submittedAt: Date | string;
  formId: string;
  answers: { [key: string]: any };
  metadata: ResponseMetadata;
};

function dataToTable(data: Response[]): ResponseDisplayRow[] {
  return data.map((d) => {
    return {
      ...d,
      answers: d.answers.reduce((acc, a) => {
        acc[a.field] = a.data.value;
        return acc;
      }, {}),
    };
  });
}

const table = createTable().setRowType<ResponseDisplayRow>();

const defaultColumns = [
  table.createDataColumn("submittedAt", {
    id: "Date",
    cell: (info) => dayjs(info.getValue()).format("DD MMM YYYY\nHH:mm"),
    footer: (props) => props.column.id,
  }),
];

function makeAnswersColumn(data: ResponseDisplayRow[]) {
  // read all anser fields, make the necessary columns
  const fields = new Set<string>();
  data.forEach((response) => {
    Object.keys(response.answers).forEach((k) => {
      fields.add(k);
    });
  });

  return Array.from(fields).map((f) => {
    return table.createDataColumn(
      (r: ResponseDisplayRow) => {
        return r.answers[f];
      },
      {
        id: f,
        cell: (info) => {
          return info.getValue();
        },
      }
    );
  });
}

function Table({ data }: { data: Response[] }) {
  const displayData = useMemo(() => dataToTable(data), [data.length]);

  const columns = [...defaultColumns, ...makeAnswersColumn(displayData)];

  // Create the instance and pass your options
  const instance = useTableInstance(table, {
    data: displayData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  // Manage your own state
  const [state, setState] = React.useState(instance.initialState);

  // Override the state managers for the table instance to your own
  instance.setOptions((prev) => ({
    ...prev,
    state,
    onStateChange: setState,
    // These are just table options, so if things
    // need to change based on your state, you can
    // derive them here

    // Just for fun, let's debug everything if the pageIndex
    // is greater than 2
    debugTable: state.pagination.pageIndex > 2,
  }));

  return (
    <Style className="p-2">
      <table>
        <thead>
          {instance.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id} colSpan={header.colSpan}>
                  {header.isPlaceholder ? null : header.renderHeader()}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {instance.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id}>{cell.renderCell()}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="h-2" />
      <div className="flex items-center gap-2">
        <button
          className="border rounded p-1"
          onClick={() => instance.setPageIndex(0)}
          disabled={!instance.getCanPreviousPage()}
        >
          {"<<"}
        </button>
        <button
          className="border rounded p-1"
          onClick={() => instance.previousPage()}
          disabled={!instance.getCanPreviousPage()}
        >
          {"<"}
        </button>
        <button
          className="border rounded p-1"
          onClick={() => instance.nextPage()}
          disabled={!instance.getCanNextPage()}
        >
          {">"}
        </button>
        <button
          className="border rounded p-1"
          onClick={() => instance.setPageIndex(instance.getPageCount() - 1)}
          disabled={!instance.getCanNextPage()}
        >
          {">>"}
        </button>
        <span className="flex items-center gap-1">
          <div>Page</div>
          <strong>
            {instance.getState().pagination.pageIndex + 1} of{" "}
            {instance.getPageCount()}
          </strong>
        </span>
        <span className="flex items-center gap-1">
          | Go to page:
          <input
            type="number"
            defaultValue={instance.getState().pagination.pageIndex + 1}
            onChange={(e) => {
              const page = e.target.value ? Number(e.target.value) - 1 : 0;
              instance.setPageIndex(page);
            }}
            className="border p-1 rounded w-16"
          />
        </span>
        <select
          value={instance.getState().pagination.pageSize}
          onChange={(e) => {
            instance.setPageSize(Number(e.target.value));
          }}
        >
          {[10, 50, 100, 500, 1000].map((pageSize) => (
            <option key={pageSize} value={pageSize}>
              Show {pageSize}
            </option>
          ))}
        </select>
      </div>
      <div className="h-4" />
    </Style>
  );
}

const Style = styled.div`
  table {
    border: 1px solid lightgray;
  }

  tbody {
    border-bottom: 1px solid lightgray;
  }

  th {
    border-bottom: 1px solid lightgray;
    border-right: 1px solid lightgray;
    padding: 2px 4px;
  }

  tfoot {
    color: gray;
  }

  tfoot th {
    font-weight: normal;
  }
`;

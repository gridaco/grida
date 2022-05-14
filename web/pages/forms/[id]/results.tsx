import React, { useEffect } from "react";
import styled from "@emotion/styled";
import {
  createTable,
  getCoreRowModel,
  getPaginationRowModel,
  useTableInstance,
} from "@tanstack/react-table";
import Axios from "axios";
import { useRouter } from "next/router";

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
      <Table data={data as any} />
    </>
  );
}

type Response = {
  id: string;
  landedAt: Date | string;
  submittedAt: Date | string;
  formId: string;
  answers: {
    field: string;
    data: {
      value: any;
    };
  }[];
  metadata: {
    ip: string;
    browser: null;
    platform: "api" | "web";
    referer: string;
    ua: string;
  };
};

type Row = {
  firstName: string;
  lastName: string;
  age: number;
  visits: number;
  status: string;
  progress: number;
};

const table = createTable().setRowType<Response>();

const defaultColumns = [
  table.createDataColumn("id", {
    cell: (info) => info.getValue(),
    footer: (props) => props.column.id,
  }),
  table.createDataColumn("submittedAt", {
    cell: (info) => new Date(info.getValue()).toLocaleDateString("en-US"),
    footer: (props) => props.column.id,
  }),
];

function Table({ data }: { data: Response[] }) {
  const [columns] = React.useState<typeof defaultColumns>(() => [
    ...defaultColumns,
  ]);

  const rerender = React.useReducer(() => ({}), {})[1];

  // Create the instance and pass your options
  const instance = useTableInstance(table, {
    data,
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
        <tfoot>
          {instance.getFooterGroups().map((footerGroup) => (
            <tr key={footerGroup.id}>
              {footerGroup.headers.map((header) => (
                <th key={header.id} colSpan={header.colSpan}>
                  {header.isPlaceholder ? null : header.renderFooter()}
                </th>
              ))}
            </tr>
          ))}
        </tfoot>
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
          {[10, 20, 30, 40, 50].map((pageSize) => (
            <option key={pageSize} value={pageSize}>
              Show {pageSize}
            </option>
          ))}
        </select>
      </div>
      <div className="h-4" />
      <button onClick={() => rerender()} className="border p-2">
        Rerender
      </button>
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

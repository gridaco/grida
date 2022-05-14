import React from "react";
import styled from "@emotion/styled";
import { TableTabItem } from "@app/blocks/table-tab-item";
import { FormGridItemCard } from "@app/cms-forms/components";
import { InBlockButton } from "@app/blocks";
import { useRouter } from "next/router";

const tabs = [
  {
    id: "published",
    label: "Published",
  },
  {
    id: "drafts",
    label: "Drafts and submissions",
  },
  {
    id: "scheduled",
    label: "Scheduled",
  },
  {
    id: "unlisted",
    label: "Unlisted",
  },
];

export default function FormsPage() {
  const router = useRouter();
  const [tab, setTab] = React.useState("published");

  return (
    <>
      <div
        style={{
          padding: 120,
        }}
      >
        <Toolbar>
          <Underline />
          <Tools>
            <Tabs>
              {tabs.map((t) => (
                <TableTabItem
                  key={t.id}
                  selected={tab === t.id}
                  onClick={() => {
                    setTab(t.id);
                  }}
                >
                  {t.label}
                </TableTabItem>
              ))}
            </Tabs>
            <Actions>
              <Button
                onClick={() => {
                  // new form
                }}
              >
                <Icons
                  src="grida://assets-reservation/images/1009:87638"
                  alt="icon"
                />
                <ButtonLabel>New Form</ButtonLabel>
              </Button>
            </Actions>
          </Tools>
        </Toolbar>
        <Table>
          {[
            "627c199df1b723e5493d3d6e",
            "627c199df1b723e5493d3d6e",
            "627c199df1b723e5493d3d6e",
            "627c199df1b723e5493d3d6e",
            "627c199df1b723e5493d3d6e",
            "627c199df1b723e5493d3d6e",
            "627c199df1b723e5493d3d6e",
            "627c199df1b723e5493d3d6e",
            "627c199df1b723e5493d3d6e",
          ].map((d) => {
            return (
              <FormGridItemCard
                key={d}
                name="PlayX4"
                onClick={() => {
                  router.push("/forms/[id]", `/forms/${d}`);
                }}
              />
            );
          })}
        </Table>
      </div>
    </>
  );
}

const Table = styled.div`
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  padding-top: 40px;
  padding-bottom: 40px;
  grid-gap: 24px;
`;

const Toolbar = styled.div`
  height: 50px;
  position: relative;
`;

const Underline = styled.div`
  height: 1px;
  background-color: rgb(196, 196, 196);
  position: absolute;
  left: 0px;
  right: 0px;
  bottom: 0px;
`;

const Tools = styled.div`
  display: flex;
  justify-content: space-between;
  flex-direction: row;
  align-items: center;
  flex: none;
  box-sizing: border-box;
  position: absolute;
  left: 0px;
  top: 0px;
  right: 0px;
  bottom: 0px;
`;

const Tabs = styled.div`
  display: flex;
  justify-content: flex-start;
  flex-direction: row;
  align-items: flex-start;
  gap: 21px;
  align-self: stretch;
  box-sizing: border-box;
  flex-shrink: 0;
`;

const Actions = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  align-self: stretch;
  box-sizing: border-box;
  padding-left: 10px;
  flex-shrink: 0;
`;

const Button = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: row;
  align-items: center;
  flex: none;
  gap: 4px;
  border-radius: 4px;
  background-color: rgba(35, 77, 255, 0.9);
  box-sizing: border-box;
  padding: 8px 10px;
`;

const Icons = styled.img`
  width: 18px;
  height: 18px;
  object-fit: cover;
`;

const ButtonLabel = styled.span`
  color: white;
  text-overflow: ellipsis;
  font-size: 14px;
  font-family: Inter, sans-serif;
  font-weight: 500;
  text-align: center;
`;

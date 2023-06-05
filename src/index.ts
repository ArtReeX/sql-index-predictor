import {
  concat,
  filter,
  groupBy,
  head,
  isArray,
  isEmpty,
  isEqual,
  isString,
  reject,
  uniq,
  uniqWith,
  values,
} from "lodash";
import { Expr, SelectFromStatement, parse } from "pgsql-ast-parser";

export class SqlIndexPredictor {
  constructor(private readonly throwIfError: boolean = false, private readonly minIndexLength: number = 1) {}

  private handleGraph(children: Expr, parents: SelectFromStatement[]): any[] {
    if (children.type === "select" && children.where) {
      return this.handleGraph(children.where, parents);
    }
    if (children.type === "unary") {
      return this.handleGraph(children.operand, parents);
    }
    if (children.type === "call") {
      return children.args.map((ast) => {
        return this.handleGraph(ast, concat(ast.type === "select" ? ast : [], parents));
      });
    }
    if (children.type === "binary") {
      // "OR" BINARY OPERATORS
      if (children.op === "OR") {
        return [this.handleGraph(children.left, parents), this.handleGraph(children.right, parents)];
      }

      // "AND" AND OTHERS BINARY OPERATORS
      return [...this.handleGraph(children.left, parents), ...this.handleGraph(children.right, parents)];
    }
    if (children.type === "ref") {
      // WE MOVE FROM THE LAST LEVEL TO THE FIRST IN ORDER TO FIND THE CORRECT TABLE
      for (const parent of parents) {
        // IF THE QUERY DOES NOT SPECIFY A TABLE, USE THE FIRST TABLE FROM THE LIST WITHOUT AN ALIAS
        for (const table of parent.from || []) {
          if (table.type === "table" && !table.name.alias && !children.table) {
            return [`${table.name.name}.${children.name}`];
          }
        }
        // FIND A TABLE WITH AN ALIAS THE SAME AS IN THE QUERY
        for (const table of parent.from || []) {
          if (table.type === "table" && table.name.alias && table.name.alias === children.table?.name) {
            return [`${table.name.name}.${children.name}`];
          }
        }
        // FIND A TABLE WITH THE SAME NAME AS IN THE QUERY
        for (const table of parent.from || []) {
          if (table.type === "table" && !table.name.alias && table.name.name === children.table?.name) {
            return [`${table.name.name}.${children.name}`];
          }
        }
      }
    }

    return [];
  }

  private processGraph(graph: any[], result: string[][] = []): string[][] {
    result.push(uniq(filter(graph, isString)).sort());

    filter(graph, isArray).forEach((subGraph) => this.processGraph(subGraph, result));

    return result.reduce<string[][]>(
      (indexes, index) => [...indexes, ...values(groupBy(index, (column) => head(column.split("."))))],
      []
    );
  }

  public predict(sqlQuery: string): string[][] {
    try {
      const predictedIndexes = parse(sqlQuery).reduce<string[][]>((indexes, ast) => {
        if (ast.type === "select") {
          return [...indexes, ...this.handleGraph(ast, [ast])];
        }

        return [];
      }, []);

      return reject(uniqWith(this.processGraph(predictedIndexes), isEqual), isEmpty).filter(
        (index) => index.length >= this.minIndexLength
      );
    } catch (err) {
      if (this.throwIfError) {
        throw err;
      }
      return [];
    }
  }
}

export default SqlIndexPredictor;

console.log(
  new SqlIndexPredictor(true).predict(
    `select distinct "showcase".*, (select CAST(count("sc_to_acc"."id")::int AS bool) from "showcases_to_accounts" as "sc_to_acc" where "sc_to_acc"."showcase_id" = "showcase"."id" and "sc_to_acc"."account_id" = '1') as "is_saved", "showcase".*, (select count(distinct "comments"."id") from "showcases_comments" as "comments" where "comments"."showcase_id" = "showcase"."id" and "comments"."is_draft" = '1') as "comments_count", "showcase"."id" from "showcases" as "showcase" where "showcase"."status" = '1' and ("showcase"."owner_id" = '1' or ("showcase"."status" = '1' and exists (select "associate".* from "associates_accounts" as "associate" where "associate"."status" = '1' and "associate"."virtual" = '1' and (("associate"."from_id" = "showcase"."owner_id" and "associate"."to_id" = '1') or ("associate"."from_id" = '1' and "associate"."to_id" = "showcase"."owner_id")) and (("showcase"."share_outer_categories_first" = '1' and "showcase"."share_outer_categories_second" = '2' and not exists (select "categories".* from "associate_categories" as "categories" inner join "associates_to_categories" on "categories"."id" = "associates_to_categories"."associate_category_id" where "associates_to_categories"."associate_id" = "associate"."id" and "categories"."owner_id" = "showcase"."owner_id")) or (exists (select "categories".* from "associate_categories" as "categories" inner join "associates_to_categories" on "categories"."id" = "associates_to_categories"."associate_category_id" where "associates_to_categories"."associate_id" = "associate"."id" and exists (select "showcases_map".* from "associate_categories_to_showcases" as "showcases_map" where "showcases_map"."category_id" = "categories"."id" and "showcases_map"."showcase_id" = "showcase"."id")))))) or ("showcase"."status" = '1' and exists (select "departments".* from "departments" inner join "departments_to_showcases" on "departments"."id" = "departments_to_showcases"."department_id" where "departments_to_showcases"."showcase_id" = "showcase"."id" and exists (select "staffs_map".* from "departments_to_accounts" as "staffs_map" where "staffs_map"."department_id" = "departments"."id" and "staffs_map"."account_id" = '1'))) or ("showcase"."status" = '1' and exists (select "organization".* from "accounts" as "organization" inner join "outer_departments_organizations" on "organization"."id" = "outer_departments_organizations"."organization_id" where "outer_departments_organizations"."showcase_id" = "showcase"."id" and exists (select "linked_private_accounts_map".* from "business_account_users" as "linked_private_accounts_map" where "linked_private_accounts_map"."business_account_id" = "organization"."id" and "linked_private_accounts_map"."status" = '1' and "linked_private_accounts_map"."account_id" = '1') and not exists (select "departments_as_organization_map".* from "departments_to_accounts" as "departments_as_organization_map" where "departments_as_organization_map"."organization_id" = "organization"."id" and "departments_as_organization_map"."account_id" = '1')))) and ("showcase"."title" ~* '1') order by "showcase"."updated_at" desc limit '1'`
  )
);

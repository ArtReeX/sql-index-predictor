import { filter, isArray, isEmpty, isEqual, isString, reject, uniq, uniqWith } from "lodash";
import { Expr, From, nil, parse } from "pgsql-ast-parser";

export class SqlIndexPredictor {
  private handleGraph(data: Expr, from: From[] | nil): any[] {
    if (data.type === "select" && data.where) {
      return this.handleGraph(data.where, data.from);
    }
    if (data.type === "unary") {
      return this.handleGraph(data.operand, from);
    }
    if (data.type === "call") {
      return data.args.map((ast) => this.handleGraph(ast, ast.type === "select" ? ast.from : from));
    }
    if (data.type === "binary") {
      // "OR" BINARY OPERATORS
      if (data.op === "OR") {
        return [this.handleGraph(data.left, from), this.handleGraph(data.right, from)];
      }

      // "AND" AND OTHERS BINARY OPERATORS
      return [...this.handleGraph(data.left, from), ...this.handleGraph(data.right, from)];
    }
    if (data.type === "ref") {
      for (const table of from || []) {
        // FIND A TABLE WITH AN ALIAS THE SAME AS IN THE QUERY
        if (table.type === "table" && table.name.alias && data.table && table.name.alias === data.table.name) {
          return [`${table.name.name}.${data.name}`];
        }
      }
      for (const table of from || []) {
        // FIND A TABLE WITH THE SAME NAME AS IN THE QUERY
        if (table.type === "table" && !table.name.alias && data.table && table.name.name === data.table.name) {
          return [`${table.name.name}.${data.name}`];
        }
        // IF THE QUERY DOES NOT SPECIFY A TABLE, USE THE FIRST TABLE FROM THE LIST WITHOUT AN ALIAS
        if (table.type === "table" && !table.name.alias && !data.table) {
          return [`${table.name.name}.${data.name}`];
        }
      }
    }

    return [];
  }

  private processGraph(graph: any[], result: string[][] = []): string[][] {
    result.push(uniq(filter(graph, isString)).sort());

    filter(graph, isArray).forEach((subGraph) => this.processGraph(subGraph, result));

    return result;
  }

  public predict(sqlQuery: string): string[][] {
    const predictedIndexes = parse(sqlQuery).reduce<string[][]>((indexes, ast) => {
      if (ast.type === "select") {
        return [...indexes, ...this.handleGraph(ast, ast.from)];
      }

      return [];
    }, []);

    return reject(uniqWith(this.processGraph(predictedIndexes), isEqual), isEmpty);
  }
}

export default SqlIndexPredictor;

const sql = `
select "files".*, COALESCE(p2p_file_shared_date("files"."id", CAST(NULL AS bigint)), LEAST((select "cases_permissions"."created_at" from "case_file_permissions_map" as "cases_permissions" inner join "files_to_cases" on "cases_permissions"."case_file_id" = "files_to_cases"."id" where "files_to_cases"."file_id" = "files"."id" order by "cases_permissions"."created_at" asc limit 1), (select "p2p_permissions"."created_at" from "p2p_file_permissions_map" as "p2p_permissions" where "p2p_permissions"."file_id" = "files"."id" order by "p2p_permissions"."created_at" asc limit 1))) as "shared_at" from "files" where "files"."deleted_at" is null and ("files"."deleted_at" is null) and (exists (select "p2p_permissions".* from "p2p_file_permissions_map" as "p2p_permissions" where "p2p_permissions"."file_id" = "files"."id" and "p2p_permissions"."account_id" = '3') or exists (select "case_files".* from "files_to_cases" as "case_files" where "case_files"."file_id" = "files"."id" and (exists (select "permissions".* from "case_file_permissions_map" as "permissions" where "permissions"."case_file_id" = "case_files"."id" and "permissions"."account_id" = '3')) and exists (select "case".* from "cases" as "case" where "case"."id" = "case_files"."case_id" and "case"."deleted_at" is null and ("case"."status" = 'ACTIVE' or "case"."owner_id" = '3' or ("files"."owner_id" = '3' and not "case"."status" = 'ACTIVE'))))) and ("files"."deleted_at" is null and not "files"."owner_id" = '3') and ("files"."deleted_at" is null and "files"."extension" ~ '.jpg|.jpeg|.png|.tif|.tiff|.bmp|.dib|.gif|.webp|.stl|.dicom|.dcm|.obj|.ply|7z|s7z|apk|rar|zip|zipx|tar.bz2|tar.gz|tar.lz|tar.lzma|tar.lzo|tar.xz|tar.Z|tar.zst') and "files"."uploaded" = true and not "files"."uploaded_from" = 'SHOWCASE' and ("files"."deleted_at" is null) order by "files"."created_at" desc
`;

console.log(new SqlIndexPredictor().predict(sql));

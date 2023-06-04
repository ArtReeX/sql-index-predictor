import { castArray, isEmpty, isEqual, map, reject, uniqWith } from "lodash";
import { Expr, From, nil, parse } from "pgsql-ast-parser";

export class SqlIndexPredictor {
  private handleExpr(data: Expr, from: From[] | nil): any[] {
    if (data.type === "select" && data.where) {
      return this.handleExpr(data.where, data.from);
    }
    if (data.type === "unary") {
      return this.handleExpr(data.operand, from);
    }
    if (data.type === "call") {
      return data.args.map((ast) => this.handleExpr(ast, ast.type === "select" ? ast.from : from));
    }
    if (data.type === "binary") {
      // "OR" BINARY OPERATORS
      if (data.op === "OR") {
        return [
          ...this.handleExpr(data.left, from).map((index) => castArray(index)),
          ...this.handleExpr(data.right, from).map((index) => castArray(index)),
        ];
      }

      // "AND" AND OTHERS BINARY OPERATORS
      return [...this.handleExpr(data.left, from), ...this.handleExpr(data.right, from)];
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

  public predictIndexes(sqlQuery: string): string[][] {
    const predictedIndexes = parse(sqlQuery).reduce<string[][]>((indexes, ast) => {
      if (ast.type === "select") {
        return [...indexes, ...this.handleExpr(ast, ast.from)];
      }

      return [];
    }, []);

    return reject(map(uniqWith(predictedIndexes, isEqual), castArray), isEmpty);
  }
}

export default SqlIndexPredictor;

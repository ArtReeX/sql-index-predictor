import { filter, isArray, isEmpty, isEqual, isString, map, reject, sortedUniq, uniqWith } from "lodash";
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
    result.push(filter(graph, isString));

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

    return reject(uniqWith(map(this.processGraph(predictedIndexes), sortedUniq), isEqual), isEmpty);
  }
}

export default SqlIndexPredictor;

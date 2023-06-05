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

import { filter, isArray, isEmpty, isEqual, isString, reject, uniq, uniqWith } from "lodash";
import { Expr, SelectFromStatement, parse } from "pgsql-ast-parser";

export class SqlIndexPredictor {
  constructor(private readonly throwIfError: boolean = false, private readonly minIndexLength: number = 1) {}

  private handleGraph(children: Expr, parent: SelectFromStatement): any[] {
    if (children.type === "select" && children.where) {
      return this.handleGraph(children.where, children);
    }
    if (children.type === "unary") {
      return this.handleGraph(children.operand, parent);
    }
    if (children.type === "call") {
      return children.args.map((ast) => this.handleGraph(ast, ast.type === "select" ? ast : parent));
    }
    if (children.type === "binary") {
      // "OR" BINARY OPERATORS
      if (children.op === "OR") {
        return [this.handleGraph(children.left, parent), this.handleGraph(children.right, parent)];
      }

      // "AND" AND OTHERS BINARY OPERATORS
      return [...this.handleGraph(children.left, parent), ...this.handleGraph(children.right, parent)];
    }
    if (children.type === "ref") {
      for (const table of parent.from || []) {
        // FIND A TABLE WITH AN ALIAS THE SAME AS IN THE QUERY
        if (table.type === "table" && table.name.alias && children.table && table.name.alias === children.table.name) {
          return [`${table.name.name}.${children.name}`];
        }
      }
      for (const table of parent.from || []) {
        // FIND A TABLE WITH THE SAME NAME AS IN THE QUERY
        if (table.type === "table" && !table.name.alias && children.table && table.name.name === children.table.name) {
          return [`${table.name.name}.${children.name}`];
        }
        // IF THE QUERY DOES NOT SPECIFY A TABLE, USE THE FIRST TABLE FROM THE LIST WITHOUT AN ALIAS
        if (table.type === "table" && !table.name.alias && !children.table) {
          return [`${table.name.name}.${children.name}`];
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
    try {
      const predictedIndexes = parse(sqlQuery).reduce<string[][]>((indexes, ast) => {
        if (ast.type === "select") {
          return [...indexes, ...this.handleGraph(ast, ast)];
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

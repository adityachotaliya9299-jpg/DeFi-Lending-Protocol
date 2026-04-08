import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";

const SUBGRAPH_URL =
  "https://api.studio.thegraph.com/query/4f8dd4ddbc0f6afeb97a9bbe581501f2/defi-lending-protocol/v0.1.0";

export const graphClient = new ApolloClient({
  link:  new HttpLink({ uri: SUBGRAPH_URL }),
  cache: new InMemoryCache(),
});
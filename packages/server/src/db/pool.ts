import pg from "pg";

/**
 * Pool de connexions : ouvrir une connexion PostgreSQL coûte cher, on en garde
 * quelques-unes ouvertes et on les réutilise.
 */
export function createPool(connectionString: string, options: pg.PoolConfig = {}): pg.Pool {
  const pool = new pg.Pool({ connectionString, max: 10, ...options });
  // Une connexion inactive qui tombe (redémarrage de la base...) ne doit pas tuer le serveur.
  pool.on("error", (error) =>
    console.error("[db] erreur d'une connexion inactive :", error.message),
  );
  return pool;
}

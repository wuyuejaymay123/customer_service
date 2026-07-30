import { DataTypes, Model, Sequelize, QueryTypes } from 'sequelize';

export class Instance extends Model {
  declare id: number; // instance_id

  declare app_id: string;

  declare env_id: string;

  declare shop_name: string | null;

  /** pending | logged_in | unknown | closed */
  declare login_status: string | null;

  /** 网关 Shop.id（UUID） */
  declare gateway_shop_id: string | null;

  declare created_at: string;
}

export function initInstance(sequelize: Sequelize) {
  Instance.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      app_id: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      env_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      shop_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      login_status: {
        type: DataTypes.STRING(32),
        allowNull: true,
        defaultValue: 'unknown',
      },
      gateway_shop_id: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: 'Instance',
      tableName: 'instance',
      timestamps: false,
    },
  );
}

/** 既有 DB 补字段 */
export async function migrateInstanceColumns(sequelize: Sequelize) {
  const cols = (await sequelize.query(`PRAGMA table_info(instance)`, {
    type: QueryTypes.SELECT,
  })) as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('shop_name')) {
    await sequelize.query(
      `ALTER TABLE instance ADD COLUMN shop_name VARCHAR(255)`,
    );
  }
  if (!names.has('login_status')) {
    await sequelize.query(
      `ALTER TABLE instance ADD COLUMN login_status VARCHAR(32) DEFAULT 'unknown'`,
    );
  }
  if (!names.has('gateway_shop_id')) {
    await sequelize.query(
      `ALTER TABLE instance ADD COLUMN gateway_shop_id VARCHAR(64)`,
    );
  }
}

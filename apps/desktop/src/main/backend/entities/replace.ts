import { DataTypes, Model, Sequelize } from 'sequelize';

// Extend the Model class with the attributes interface
export class ReplaceKeyword extends Model {
  declare id: number; // Note that the `null assertion` `!` is required in strict mode.

  declare keyword: string;

  declare app_id: string;

  declare replace: string;

  declare fuzzy: boolean;

  declare has_regular: boolean;

  declare cloud_id: string | null;
}

export async function checkAndAddReplaceFields(sequelize: Sequelize) {
  const tableDescription = await ReplaceKeyword.describe();
  // @ts-ignore
  if (!tableDescription.cloud_id) {
    await sequelize.getQueryInterface().addColumn('replace', 'cloud_id', {
      type: DataTypes.STRING(64),
      allowNull: true,
    });
  }
}

export function initReplace(sequelize: Sequelize) {
  ReplaceKeyword.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      keyword: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      replace: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      has_regular: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
      },
      app_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      fuzzy: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: true,
      },
      cloud_id: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'Replace',
      tableName: 'replace',
      timestamps: false,
    },
  );
  checkAndAddReplaceFields(sequelize);
}
